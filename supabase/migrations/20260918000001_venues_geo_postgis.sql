-- ─────────────────────────────────────────────────────────────
-- Exact-radius geo filtering for venues, replacing the
-- bounding-box + JS-haversine pattern in feed-tabs. The bounding
-- box is a rectangle (up to ~78% larger in area than the circle
-- it approximates), and today's queries apply LIMIT before the
-- JS radius correction runs — so popular venues sitting in the
-- box's corners can eat result slots before the correction ever
-- discards them, silently starving results even when plenty of
-- venues exist within the true radius. See issue #356.
--
-- PostGIS is already enabled in this project (used by the
-- unrelated walkin_venues.coordinates column) but not applied to
-- venues until now.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE venues ADD COLUMN IF NOT EXISTS geo geography(Point, 4326);

UPDATE venues SET geo = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  WHERE lat IS NOT NULL AND lng IS NOT NULL AND geo IS NULL;

CREATE INDEX IF NOT EXISTS idx_venues_geo ON venues USING GIST (geo);

-- Keep geo in sync automatically on every insert/update of lat/lng,
-- so no application write path (recommend/index.ts venue
-- registration, search-google-place, aggregate-venue-signals,
-- refresh-venue-weekly/photos, ...) needs to know geo exists.
CREATE OR REPLACE FUNCTION venues_sync_geo() RETURNS trigger AS $$
BEGIN
  NEW.geo := CASE WHEN NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL
    THEN ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography
    ELSE NULL END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venues_sync_geo_trigger ON venues;
CREATE TRIGGER venues_sync_geo_trigger
  BEFORE INSERT OR UPDATE OF lat, lng ON venues
  FOR EACH ROW EXECUTE FUNCTION venues_sync_geo();

-- Shared RPC for feed-tabs' four branches (popular/new/trending/walkin).
-- One function, not four bespoke ones, to avoid duplicating the
-- geo/chain/removed/rating/price/cuisine/exclusion filters. The
-- ORDER BY column is chosen via an allowlist CASE (never
-- string-interpolated from caller input) so there's no injection
-- risk despite the dynamic SQL.
--
-- Also fixes a pre-existing, separate bug found while building this:
-- the old cuisine filter (applyPriceAndCuisine in feed-tabs/index.ts)
-- targeted a column called `types`, which does not exist on venues
-- (only venue_types does — confirmed directly against the DB, `types`
-- 400s). This function uses the correct venue_types column.
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
       AND ($10::int[] IS NULL OR price_level = ANY($10))
       AND ($11::text[] IS NULL OR venue_types && $11)
       AND ($12::text[] IS NULL OR google_place_id <> ALL($12))
     ORDER BY %s DESC NULLS LAST LIMIT $13', safe_order)
  USING center_lng, center_lat, radius_km, min_rating, min_review_count,
        require_review_count, max_review_count_at_ingestion, require_trending_score,
        created_after, price_levels, cuisine_types, exclude_ids, result_limit;
END;
$$;
