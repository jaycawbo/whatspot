import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Generates dynamic filter tags for a user's Spots page.
 * Phase 1: Geographic (city, neighbourhood) and venue type tags — rule-based, no LLM.
 * TODO: Phase 2 vibe-based tags from LLM descriptor cache once venue_descriptors caching is in place.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all user's spots with venue data
    const { data: interactions, error: intError } = await supabase
      .from("user_venue_interactions")
      .select("venue_id, interaction_type, rating, venues!fk_uvi_venue(address, category, name)")
      .eq("user_id", user.id);

    if (intError) throw intError;

    const spots = (interactions || []).map((row: any) => ({
      venues: row.venues,
    }));
    const totalSpots = spots.length;

    // If fewer than 10 spots, return empty tags
    if (totalSpots < 10) {
      return new Response(JSON.stringify({ tags: [], total_spots: totalSpots }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const threshold = Math.max(3, Math.ceil(totalSpots * 0.1));
    const tagCounts: Record<string, { count: number; type: "geographic" | "venue_type" }> = {};

    for (const spot of spots) {
      const venue = spot.venues as any;
      if (!venue) continue;

      // --- Geographic tags from address ---
      if (venue.address) {
        const parts = venue.address.split(",").map((p: string) => p.trim());

        // City: usually the 2nd or 3rd part (before province/state)
        // Neighbourhood: usually the 1st part after street number, or 2nd part
        if (parts.length >= 3) {
          // Try to extract city (usually second-to-last before country or postal)
          const cityCandidate = parts[parts.length - 3]?.trim();
          if (cityCandidate && !/^\d/.test(cityCandidate) && cityCandidate.length > 1) {
            const cityKey = cityCandidate;
            if (!tagCounts[cityKey]) tagCounts[cityKey] = { count: 0, type: "geographic" };
            tagCounts[cityKey].count++;
          }
        }

        // Neighbourhood: second part of the address (after street)
        if (parts.length >= 2) {
          const neighbourhoodCandidate = parts[1]?.trim();
          if (
            neighbourhoodCandidate &&
            !/^\d/.test(neighbourhoodCandidate) &&
            neighbourhoodCandidate.length > 1 &&
            !/^[A-Z]\d[A-Z]/.test(neighbourhoodCandidate) // skip postal codes
          ) {
            const nKey = neighbourhoodCandidate;
            if (!tagCounts[nKey]) tagCounts[nKey] = { count: 0, type: "geographic" };
            tagCounts[nKey].count++;
          }
        }
      }

      // --- Venue type tags from category ---
      if (venue.category) {
        // Normalize category: capitalize, strip underscores
        const cat = venue.category
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
        if (!tagCounts[cat]) tagCounts[cat] = { count: 0, type: "venue_type" };
        tagCounts[cat].count++;
      }
    }

    // Filter by threshold, sort by frequency, take top 8
    const tags = Object.entries(tagCounts)
      .filter(([_, v]) => v.count >= threshold)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([label, v]) => ({
        label,
        count: v.count,
        type: v.type,
      }));

    return new Response(JSON.stringify({ tags, total_spots: totalSpots }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("generate-spots-tags error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
