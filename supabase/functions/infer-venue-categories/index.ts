import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let body: { dry_run?: boolean; batch_size?: number } = {};
    try { body = await req.json(); } catch { /* no body */ }
    const dryRun = body.dry_run === true;
    const batchSize = Math.min(body.batch_size ?? 50, 100);
    const limit = body.limit ?? 1042;

    // Fetch venues where category IS NULL
    const { data: venues, error: fetchError } = await supabase
      .from('venues')
      .select('google_place_id, name')
      .is('category', null)
      .not('name', 'is', null)
      .order('review_count', { ascending: false })
      .limit(limit);

    if (fetchError) throw fetchError;
    if (!venues?.length) {
      return new Response(
        JSON.stringify({ message: 'No venues with null category found', processed: 0, updated: 0, skipped: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[infer-venue-categories] ${venues.length} venues to process, dry_run=${dryRun}, batch_size=${batchSize}`);

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY not configured');

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    // Split into batches and fire all Gemini calls in parallel
    const batches: typeof venues[] = [];
    for (let i = 0; i < venues.length; i += batchSize) {
      batches.push(venues.slice(i, i + batchSize));
    }

    const batchOutcomes = await Promise.all(
      batches.map(async (batch, batchIdx) => {
        const venueList = batch
          .map((v, idx) => `${idx + 1}. google_place_id: ${v.google_place_id} | name: "${v.name}"`)
          .join('\n');

        const prompt = `For each venue name, infer the most appropriate category as a lowercase snake_case string matching Google Places venue types (e.g. italian_restaurant, bar, cafe, bakery, cocktail_bar, caribbean_restaurant). Return only a JSON array of objects with google_place_id and category fields. If you cannot determine a category, use null.

Venues:
${venueList}`;

        try {
          const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0, responseMimeType: 'application/json' },
            }),
          });

          if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            console.error(`[infer-venue-categories] Gemini error on batch ${batchIdx + 1}:`, errText);
            return { results: [], failedCount: batch.length };
          }

          const geminiData = await geminiRes.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
          const results: { google_place_id: string; category: string | null }[] = JSON.parse(rawText);
          console.log(`[infer-venue-categories] Batch ${batchIdx + 1} returned ${results.length} results`);
          return { results, failedCount: 0, batch };
        } catch (err) {
          console.error(`[infer-venue-categories] Parse error on batch ${batchIdx + 1}:`, err);
          return { results: [], failedCount: batch.length, batch };
        }
      }),
    );

    // Collect all valid inferences across all batches
    const venueMap = new Map(venues.map(v => [v.google_place_id, v.name]));
    const toWrite: { google_place_id: string; category: string }[] = [];
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const { results, failedCount, batch } of batchOutcomes) {
      totalFailed += failedCount;
      const returnedIds = new Set(results.map((r: any) => r.google_place_id));
      // Count venues Gemini silently omitted
      if (batch) {
        for (const v of batch) {
          if (!returnedIds.has(v.google_place_id)) totalSkipped++;
        }
      }
      for (const result of results) {
        if (!result.google_place_id || !result.category) {
          totalSkipped++;
        } else {
          toWrite.push({ google_place_id: result.google_place_id, category: result.category });
        }
      }
    }

    // dry_run: return preview without writing
    if (dryRun) {
      const summary = {
        dry_run: true,
        processed: venues.length,
        updated: toWrite.length,
        skipped: totalSkipped,
        failed: totalFailed,
        preview: toWrite.map(r => ({ google_place_id: r.google_place_id, name: venueMap.get(r.google_place_id) ?? '', category: r.category })),
      };
      console.log(`[infer-venue-categories] Dry run complete —`, JSON.stringify({ processed: summary.processed, updated: summary.updated, skipped: summary.skipped, failed: summary.failed }));
      return new Response(JSON.stringify(summary), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update each venue individually in parallel
    let totalUpdated = 0;
    if (toWrite.length > 0) {
      const updateResults = await Promise.all(
        toWrite.map(item =>
          supabase
            .from('venues')
            .update({ category: item.category })
            .eq('google_place_id', item.google_place_id)
        ),
      );

      for (const { error } of updateResults) {
        if (error) {
          console.warn('[infer-venue-categories] Update failed:', error.message);
          totalFailed++;
        } else {
          totalUpdated++;
        }
      }
    }

    const summary = {
      processed: venues.length,
      updated: totalUpdated,
      skipped: totalSkipped,
      failed: totalFailed,
    };

    console.log(`[infer-venue-categories] Complete —`, JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[infer-venue-categories] Fatal:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
