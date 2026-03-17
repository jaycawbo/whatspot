import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const runAt = new Date().toISOString();
    console.log(`🔄 aggregate_venue_signals starting at ${runAt}`);

    // Fetch all unprocessed save and view events
    const { data: events, error: fetchError } = await supabase
      .from("user_events")
      .select("venue_id, event_type, position_in_results, search_query, neighborhood_context")
      .not("venue_id", "is", null)
      .in("event_type", ["save", "view", "dismiss", "search_surface"]);

    if (fetchError) throw fetchError;

    if (!events || events.length === 0) {
      console.log("✅ No events to process");
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by venue_id
    const venueMap: Record<string, any> = {};

    for (const event of events) {
      const id = event.venue_id;
      if (!venueMap[id]) {
        venueMap[id] = {
          venue_id: id,
          save_count: 0,
          dismiss_count: 0,
          view_count: 0,
          search_surface_count: 0,
          positions_at_save: [],
          query_contexts: [],
          neighborhoods: [],
        };
      }
      const v = venueMap[id];
      if (event.event_type === "save") {
        v.save_count++;
        if (event.position_in_results != null) v.positions_at_save.push(event.position_in_results);
      }
      if (event.event_type === "dismiss") v.dismiss_count++;
      if (event.event_type === "view") v.view_count++;
      if (event.event_type === "search_surface") v.search_surface_count++;
      if (event.search_query) v.query_contexts.push(event.search_query);
      if (event.neighborhood_context) v.neighborhoods.push(event.neighborhood_context);
    }

    // Upsert into venue_signals
    const upserts = Object.values(venueMap).map((v: any) => {
      const saveRate = v.search_surface_count > 0
        ? v.save_count / v.search_surface_count
        : 0;

      const avgPosition = v.positions_at_save.length > 0
        ? v.positions_at_save.reduce((a: number, b: number) => a + b, 0) / v.positions_at_save.length
        : null;

      // Count query context frequencies
      const queryCounts: Record<string, number> = {};
      for (const q of v.query_contexts) {
        queryCounts[q] = (queryCounts[q] || 0) + 1;
      }
      const topQueryContexts = Object.entries(queryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([query, count]) => ({ query, count }));

      // Count neighborhood frequencies
      const nhCounts: Record<string, number> = {};
      for (const n of v.neighborhoods) {
        nhCounts[n] = (nhCounts[n] || 0) + 1;
      }
      const topNeighborhoods = Object.entries(nhCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([neighborhood, count]) => ({ neighborhood, count }));

      return {
        venue_id: v.venue_id,
        save_count: v.save_count,
        dismiss_count: v.dismiss_count,
        view_count: v.view_count,
        search_surface_count: v.search_surface_count,
        save_rate: saveRate,
        avg_result_position_at_save: avgPosition,
        top_query_contexts: topQueryContexts,
        top_neighborhoods_saved_from: topNeighborhoods,
        last_signal_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    const { error: upsertError } = await supabase
      .from("venue_signals")
      .upsert(upserts, { onConflict: "venue_id" });

    if (upsertError) throw upsertError;

    // Aggregate interaction counts from user_venue_interactions
    const { data: interactions, error: intError } = await supabase
      .from('user_venue_interactions')
      .select('venue_id, interaction_type, rating');

    if (!intError && interactions) {
      const interactionMap: Record<string, {
        interested_count: number;
        not_interested_count: number;
        liked_count: number;
        disliked_count: number;
        loved_count: number;
      }> = {};

      for (const row of interactions) {
        if (!interactionMap[row.venue_id]) {
          interactionMap[row.venue_id] = {
            interested_count: 0,
            not_interested_count: 0,
            liked_count: 0,
            disliked_count: 0,
            loved_count: 0,
          };
        }
        const m = interactionMap[row.venue_id];
        if (row.interaction_type === 'interested') m.interested_count++;
        if (row.interaction_type === 'not_interested') m.not_interested_count++;
        if (row.interaction_type === 'rated' && row.rating === 'liked') m.liked_count++;
        if (row.interaction_type === 'rated' && row.rating === 'disliked') m.disliked_count++;
        if (row.interaction_type === 'rated' && row.rating === 'loved') m.loved_count++;
      }

      const interactionUpserts = Object.entries(interactionMap).map(([venue_id, counts]) => ({
        venue_id,
        ...counts,
        updated_at: new Date().toISOString(),
      }));

      if (interactionUpserts.length > 0) {
        const { error: intUpsertError } = await supabase
          .from('venue_signals')
          .upsert(interactionUpserts, { onConflict: 'venue_id' });

        if (intUpsertError) {
          console.error('Failed to upsert interaction counts:', intUpsertError.message);
        } else {
          console.log(`✅ Updated interaction counts for ${interactionUpserts.length} venues`);
        }
      }
    }

    console.log(`✅ Processed ${events.length} events across ${upserts.length} venues`);

    return new Response(
      JSON.stringify({ processed: events.length, venues_updated: upserts.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("aggregate_venue_signals error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
