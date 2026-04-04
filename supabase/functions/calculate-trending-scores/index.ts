/**
 * calculate-trending-scores
 *
 * Daily job that computes trending_score for venues in the Whatspot database.
 * Trending score = (current_review_count - previous_review_count) / previous_review_count
 *
 * This job reads ONLY from the venues table — it never calls the Google Places API.
 * trending_current_review_count and trending_previous_review_count are owned
 * exclusively by this job. No other process should write to these columns.
 *
 * Idempotency: A venue is only processed if trending_score_date IS NULL
 * or trending_score_date < today - 30 days. Re-running on the same day
 * finds a recent trending_score_date and skips all venues — no changes made.
 *
 * First run for a new venue (trending_previous_review_count IS NULL):
 *   Only establishes the baseline — writes current user_rating_count to
 *   trending_current_review_count and today to trending_score_date.
 *   No score is computed yet.
 *
 * Known limitation:
 *   Trending analysis only applies to venues already in the Whatspot database.
 *   Venues are written to the DB when first queried by a user, so early in
 *   the platform's life the eligible pool may be small enough that the standard
 *   deviation calculation is unreliable. Pre-seeding the DB with high-profile
 *   local venues before launch is recommended.
 *
 * Qualifying threshold for the Trending feed tab:
 *   trending_score > mean + 1 std dev (across all scored venues)
 *   AND user_rating_count >= 50
 *   AND trending_previous_review_count IS NOT NULL (at least 2 runs completed)
 *
 * Invocation:
 *   - pg_cron: daily at 3am UTC
 *   - Manual: POST with empty body or { dry_run: true } to preview eligible count
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ELIGIBILITY_DAYS = 30;
const MIN_REVIEW_COUNT = 50;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let body: { dry_run?: boolean } = {};
    try { body = await req.json(); } catch { /* no body */ }
    const dryRun = body.dry_run === true;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const eligibleBefore = new Date(Date.now() - ELIGIBILITY_DAYS * 86400_000)
      .toISOString().split('T')[0];

    // Fetch all eligible venues
    const { data: venues, error: fetchError } = await supabase
      .from('venues')
      .select('google_place_id, review_count, trending_current_review_count, trending_previous_review_count, trending_score_date')
      .or(`trending_score_date.is.null,trending_score_date.lt.${eligibleBefore}`)
      .not('review_count', 'is', null);

    if (fetchError) throw fetchError;
    if (!venues?.length) {
      return new Response(
        JSON.stringify({ message: 'No eligible venues', processed: 0, baseline: 0, scored: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[calculate-trending-scores] ${venues.length} eligible venues, dry_run=${dryRun}`);

    if (dryRun) {
      const withBaseline = venues.filter(v => v.trending_previous_review_count !== null).length;
      return new Response(
        JSON.stringify({ eligible: venues.length, with_baseline: withBaseline, without_baseline: venues.length - withBaseline }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let baselineCount = 0;
    let scoredCount = 0;
    let failedCount = 0;

    for (const venue of venues) {
      try {
        const currentReviewCount = venue.review_count ?? 0;

        if (venue.trending_previous_review_count === null) {
          // First run — establish baseline only, do not compute score
          const { error } = await supabase
            .from('venues')
            .update({
              trending_current_review_count: currentReviewCount,
              trending_score_date: today,
            })
            .eq('google_place_id', venue.google_place_id);

          if (error) {
            console.warn(`[calculate-trending-scores] Baseline error for ${venue.google_place_id}:`, error.message);
            failedCount++;
          } else {
            baselineCount++;
          }
        } else {
          // Subsequent run — compute score and rotate counts
          const prevCount = venue.trending_previous_review_count;
          const currCount = venue.trending_current_review_count ?? prevCount;

          // Guard against division by zero
          const score = prevCount > 0
            ? (currCount - prevCount) / prevCount
            : 0;

          // Atomic update: score + rotate current→previous + write new current + stamp date
          const { error } = await supabase
            .from('venues')
            .update({
              trending_score: score,
              trending_score_date: today,
              trending_previous_review_count: currCount,
              trending_current_review_count: currentReviewCount,
            })
            .eq('google_place_id', venue.google_place_id);

          if (error) {
            console.warn(`[calculate-trending-scores] Score error for ${venue.google_place_id}:`, error.message);
            failedCount++;
          } else {
            scoredCount++;
          }
        }
      } catch (err) {
        console.warn(`[calculate-trending-scores] Unexpected error for ${venue.google_place_id}:`, err);
        failedCount++;
      }
    }

    console.log(`[calculate-trending-scores] Done — baseline: ${baselineCount}, scored: ${scoredCount}, failed: ${failedCount}`);
    return new Response(
      JSON.stringify({ processed: venues.length, baseline: baselineCount, scored: scoredCount, failed: failedCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[calculate-trending-scores] Fatal:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
