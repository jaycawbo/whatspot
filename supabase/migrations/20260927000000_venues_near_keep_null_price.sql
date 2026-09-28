-- Keep venues with no price_level when a price filter is active (issue #380).
-- ~44% of venues have no Google price, and venues_near previously dropped all of them
-- under any price filter while recommend (For You) kept them — the two feed paths
-- disagreed. feed-tabs now ranks these venues lower (0.7 weight) instead.
-- Only the price clause changes; everything else matches 20260918000001.
CREATE OR REPLACE FUNCTION venues_near(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision,
  min_rating numeric DEFAULT 4.0,
  min_review_count integer DEFAULT NULL,
  require_review_count boolean DEFAULT false,
  max_review_count_at_ingestion integer DEFAULT NULL,
  require_trending_score boolean DEFAULT false,
  created_after timestamptz DEFAULT NULL,
  price_levels integer[] DEFAULT NULL,
  cuisine_types text[] DEFAULT NULL,
  exclude_ids text[] DEFAULT NULL,
  order_by_column text DEFAULT 'review_count',
  result_limit integer DEFAULT 40
)
RETURNS SETOF venues
LANGUAGE plpgsql STABLE AS $$
DECLARE
  safe_order text;
BEGIN
  -- The final ORDER BY appends " DESC" once, applying to whichever
  -- column ends this list — for 'rating_review' that's review_count,
  -- giving "rating DESC, review_count DESC" (rating primary, review
  -- count as tiebreaker), which is the intended compound sort.
  safe_order := CASE order_by_column
    WHEN 'trending_score' THEN 'trending_score'
    WHEN 'created_at'     THEN 'created_at'
    WHEN 'rating_review'  THEN 'rating DESC, review_count'
    ELSE 'review_count'
  END;

  RETURN QUERY EXECUTE format(
    'SELECT * FROM venues
     WHERE geo IS NOT NULL
       AND ST_DWithin(geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3 * 1000)
       AND is_chain = false AND is_removed = false
       AND rating >= $4
       AND ($5::int IS NULL OR review_count >= $5)
       AND ($6 = false OR review_count IS NOT NULL)
       AND ($7::int IS NULL OR review_count_at_ingestion < $7)
       AND ($8 = false OR trending_score IS NOT NULL)
       AND ($9::timestamptz IS NULL OR created_at >= $9)
       AND ($10::int[] IS NULL OR price_level IS NULL OR price_level = ANY($10))
       AND ($11::text[] IS NULL OR venue_types && $11)
       AND ($12::text[] IS NULL OR google_place_id <> ALL($12))
     ORDER BY %s DESC NULLS LAST LIMIT $13', safe_order)
  USING center_lng, center_lat, radius_km, min_rating, min_review_count,
        require_review_count, max_review_count_at_ingestion, require_trending_score,
        created_after, price_levels, cuisine_types, exclude_ids, result_limit;
END;
$$;
