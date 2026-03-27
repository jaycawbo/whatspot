-- ============================================================
-- WhatSpot Migration: Brantford Schema → Production Schema
-- 2026-03-27
--
-- Operations summary:
--   1.  Consolidate address columns → full formatted address
--   2.  Rename restaurants → venues + remap columns
--   3.  Add google_place_id UNIQUE constraint (needed for FK from user_venue_interactions)
--   4.  Backfill venues.rating / review_count from reviews_sentiment
--   5.  Drop unused columns from venues
--   6.  Drop: analysis_queue, cuisines, restaurant_cuisines,
--             search_queries, user_favorites, favorites (old)
--   7.  Create: favorites (new schema with labels)
--   8.  Create: user_profiles
--   9.  Create: user_venue_interactions
--   10. Create: skip_history
--   11. Create: user_events
--   12. Create: venue_signals
--   13. Create: constellations
--   14. Create: constellation_validations
--   15. Indexes
--   16. RLS policies
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- PRE-STEP: Drop tables that already exist in this project but
--           conflict with the migration or are not in the target
--           schema. All confirmed empty before dropping.
--
--   venues          — correct schema already, but conflicts with
--                     the restaurants → venues rename below
--   user_profiles   — exists but missing 5 columns; recreated in Step 8
--   venue_attributes — not used by the app; FK to restaurants
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS venue_attributes CASCADE;
DROP TABLE IF EXISTS user_profiles    CASCADE;
DROP TABLE IF EXISTS venues           CASCADE;


-- ─────────────────────────────────────────────────────────────
-- STEP 1: Consolidate address into a single formatted string
--         before we drop city / state_province / country.
--         Result: "123 Main St, Toronto, ON, Canada"
-- ─────────────────────────────────────────────────────────────
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS _full_address text;

UPDATE restaurants
SET _full_address = TRIM(
  CONCAT_WS(', ',
    NULLIF(TRIM(address), ''),
    NULLIF(TRIM(city), ''),
    NULLIF(TRIM(state_province), ''),
    NULLIF(TRIM(country), '')
  )
);

-- Swap consolidated address back into the address column
UPDATE restaurants SET address = _full_address WHERE _full_address IS NOT NULL AND _full_address <> '';
ALTER TABLE restaurants DROP COLUMN _full_address;


-- ─────────────────────────────────────────────────────────────
-- STEP 2: Rename restaurants → venues + remap columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE restaurants RENAME TO venues;

ALTER TABLE venues RENAME COLUMN latitude        TO lat;
ALTER TABLE venues RENAME COLUMN longitude       TO lng;
ALTER TABLE venues RENAME COLUMN price_range     TO price_level;
ALTER TABLE venues RENAME COLUMN primary_cuisine TO category;
ALTER TABLE venues RENAME COLUMN last_synced_at  TO last_fetched;


-- ─────────────────────────────────────────────────────────────
-- STEP 3: Add UNIQUE constraint on google_place_id
--         Required for FK from user_venue_interactions.venue_id
-- ─────────────────────────────────────────────────────────────
-- Remove any duplicate google_place_id rows (keep most recently created)
DELETE FROM venues v1
USING venues v2
WHERE v1.google_place_id = v2.google_place_id
  AND v1.google_place_id IS NOT NULL
  AND v1.created_at < v2.created_at;

ALTER TABLE venues ADD CONSTRAINT venues_google_place_id_key UNIQUE (google_place_id);


-- ─────────────────────────────────────────────────────────────
-- STEP 4: Add missing columns + backfill from reviews_sentiment
-- ─────────────────────────────────────────────────────────────
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS photo_url    text,
  ADD COLUMN IF NOT EXISTS rating       numeric,
  ADD COLUMN IF NOT EXISTS review_count integer;

-- Backfill rating and review_count from reviews_sentiment where available
UPDATE venues v
SET
  rating       = rs.google_rating,
  review_count = rs.google_review_count
FROM reviews_sentiment rs
WHERE rs.venue_id = v.id
  AND rs.google_rating IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- STEP 5: Drop columns from venues that the app doesn't use
-- ─────────────────────────────────────────────────────────────
ALTER TABLE venues
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state_province,
  DROP COLUMN IF EXISTS country,
  DROP COLUMN IF EXISTS postal_code,
  DROP COLUMN IF EXISTS yelp_business_id,
  DROP COLUMN IF EXISTS secondary_cuisines,
  DROP COLUMN IF EXISTS phone_number,
  DROP COLUMN IF EXISTS website,
  DROP COLUMN IF EXISTS hours_of_operation,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS is_active;


-- ─────────────────────────────────────────────────────────────
-- NOTE: reviews.venue_id and reviews_sentiment.venue_id are
-- uuid FKs to what was restaurants.id — Postgres automatically
-- retargets them to venues.id on rename. No data changes needed.
-- ─────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────
-- STEP 6: Drop tables no longer needed
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS analysis_queue      CASCADE;
DROP TABLE IF EXISTS restaurant_cuisines CASCADE;
DROP TABLE IF EXISTS cuisines            CASCADE;
DROP TABLE IF EXISTS search_queries      CASCADE;
DROP TABLE IF EXISTS user_favorites      CASCADE;
DROP TABLE IF EXISTS favorites           CASCADE;  -- replaced below with new schema (adds labels)
DROP TABLE IF EXISTS venue_attributes    CASCADE;  -- not in target schema (dropped in pre-step if present)
DROP TABLE IF EXISTS user_profiles       CASCADE;  -- replaced below with full schema (dropped in pre-step if present)


-- ─────────────────────────────────────────────────────────────
-- STEP 7: Create favorites (new schema — adds labels array)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE favorites (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id   uuid    NOT NULL REFERENCES venues(id)     ON DELETE CASCADE,
  labels     text[],
  created_at timestamptz DEFAULT now(),
  CONSTRAINT favorites_user_id_venue_id_key UNIQUE (user_id, venue_id)
);


-- ─────────────────────────────────────────────────────────────
-- STEP 8: Create user_profiles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_profiles (
  id                           uuid    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at                   timestamptz DEFAULT now(),
  display_name                 text,
  location                     text,
  preferences                  jsonb,
  spots_is_public              boolean DEFAULT false,
  spots_share_token            text UNIQUE,
  discovery_anchor_index       integer NOT NULL DEFAULT 0,
  discovery_last_criteria_pass integer NOT NULL DEFAULT 1,
  discovery_last_radius_km     numeric NOT NULL DEFAULT 5
);


-- ─────────────────────────────────────────────────────────────
-- STEP 9: Create user_venue_interactions
--         venue_id is google_place_id (text), not the uuid PK.
--         Supports anonymous interactions (user_id nullable).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_venue_interactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id     text NOT NULL,
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  venue_id         text NOT NULL REFERENCES venues(google_place_id) ON DELETE CASCADE,
  interaction_type text NOT NULL,
  rating           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uvi_anonymous_venue_key UNIQUE (anonymous_id, venue_id)
);

COMMENT ON CONSTRAINT uvi_anonymous_venue_key ON user_venue_interactions
  IS 'One interaction record per anonymous session per venue — upsert on conflict';


-- ─────────────────────────────────────────────────────────────
-- STEP 10: Create skip_history
--          Records swipe interactions for discovery suppression.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE skip_history (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id                  text NOT NULL,
  interaction_type          text NOT NULL,
  previous_interaction_type text,
  created_at                timestamptz NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- STEP 11: Create user_events
--          Analytics event log. Supports anonymous sessions.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id         text NOT NULL,
  session_id           text NOT NULL,
  user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  venue_id             text,
  event_type           text NOT NULL,
  search_query         text,
  position_in_results  integer,
  results_returned     integer,
  neighborhood_context text,
  day_of_week          integer,
  time_of_day_hour     integer,
  metadata             jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- STEP 12: Create venue_signals
--          Aggregated engagement stats keyed by google_place_id.
--          No FK — signals may exist before venue is in venues table.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE venue_signals (
  venue_id                    text    PRIMARY KEY,
  save_count                  integer NOT NULL DEFAULT 0,
  dismiss_count               integer NOT NULL DEFAULT 0,
  view_count                  integer NOT NULL DEFAULT 0,
  search_surface_count        integer NOT NULL DEFAULT 0,
  interested_count            integer NOT NULL DEFAULT 0,
  not_interested_count        integer NOT NULL DEFAULT 0,
  liked_count                 integer NOT NULL DEFAULT 0,
  disliked_count              integer NOT NULL DEFAULT 0,
  loved_count                 integer NOT NULL DEFAULT 0,
  save_rate                   numeric,
  avg_result_position_at_save numeric,
  peak_hour                   integer,
  peak_day_of_week            integer,
  top_query_contexts          jsonb,
  top_neighborhoods_saved_from jsonb,
  constellation_ids           text[],
  last_signal_at              timestamptz,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- STEP 13: Create constellations
--          Curated venue collections (AI or user-created).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE constellations (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text    NOT NULL,
  type                text    NOT NULL,
  city                text    NOT NULL,
  neighborhood        text,
  description         text,
  venue_ids           text[]  NOT NULL DEFAULT '{}',
  source              text    NOT NULL,
  credibility_score   numeric NOT NULL DEFAULT 0,
  validation_count    integer NOT NULL DEFAULT 0,
  is_public           boolean NOT NULL DEFAULT true,
  is_visible          boolean NOT NULL DEFAULT true,
  status              text    NOT NULL DEFAULT 'active',
  tag_vector          jsonb,
  created_by_user_id  uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- STEP 14: Create constellation_validations
--          User/anonymous votes on constellation accuracy.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE constellation_validations (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  constellation_id  uuid    NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  venue_id          text    NOT NULL,
  user_id           uuid    REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id      text    NOT NULL,
  validation_type   text    NOT NULL,
  confidence_delta  numeric NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────
-- STEP 15: Indexes
-- ─────────────────────────────────────────────────────────────

-- venues
CREATE INDEX idx_venues_google_place_id ON venues(google_place_id);
CREATE INDEX idx_venues_lat_lng         ON venues(lat, lng);

-- favorites
CREATE INDEX idx_favorites_user_id  ON favorites(user_id);
CREATE INDEX idx_favorites_venue_id ON favorites(venue_id);

-- user_profiles
CREATE INDEX idx_user_profiles_spots_share_token ON user_profiles(spots_share_token);

-- user_venue_interactions
CREATE INDEX idx_uvi_user_id      ON user_venue_interactions(user_id);
CREATE INDEX idx_uvi_venue_id     ON user_venue_interactions(venue_id);
CREATE INDEX idx_uvi_anonymous_id ON user_venue_interactions(anonymous_id);

-- skip_history
CREATE INDEX idx_skip_history_user_id  ON skip_history(user_id);
CREATE INDEX idx_skip_history_venue_id ON skip_history(venue_id);

-- user_events
CREATE INDEX idx_user_events_user_id    ON user_events(user_id);
CREATE INDEX idx_user_events_session_id ON user_events(session_id);
CREATE INDEX idx_user_events_venue_id   ON user_events(venue_id);
CREATE INDEX idx_user_events_event_type ON user_events(event_type);
CREATE INDEX idx_user_events_created_at ON user_events(created_at);

-- venue_signals
CREATE INDEX idx_venue_signals_updated_at ON venue_signals(updated_at);

-- constellations
CREATE INDEX idx_constellations_city       ON constellations(city);
CREATE INDEX idx_constellations_is_visible ON constellations(is_visible);
CREATE INDEX idx_constellations_status     ON constellations(status);

-- constellation_validations
CREATE INDEX idx_cv_constellation_id ON constellation_validations(constellation_id);
CREATE INDEX idx_cv_venue_id         ON constellation_validations(venue_id);

-- reviews
CREATE INDEX IF NOT EXISTS idx_reviews_venue_id ON reviews(venue_id);

-- reviews_sentiment
CREATE INDEX IF NOT EXISTS idx_reviews_sentiment_venue_id ON reviews_sentiment(venue_id);

-- search_history
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);


-- ─────────────────────────────────────────────────────────────
-- STEP 16: Row Level Security
-- ─────────────────────────────────────────────────────────────

ALTER TABLE venues                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_venue_interactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE skip_history              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_signals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE constellation_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews_sentiment         ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history            ENABLE ROW LEVEL SECURITY;

-- ── venues ────────────────────────────────────────────────────
-- Public read (all searches need this). Service role for writes
-- (only edge functions write venue records).
CREATE POLICY "venues_public_read"
  ON venues FOR SELECT USING (true);

CREATE POLICY "venues_service_write"
  ON venues FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── favorites ─────────────────────────────────────────────────
-- Users see and manage only their own favourites.
CREATE POLICY "favorites_select_own"
  ON favorites FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "favorites_insert_own"
  ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "favorites_update_own"
  ON favorites FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "favorites_delete_own"
  ON favorites FOR DELETE USING (auth.uid() = user_id);

-- ── user_profiles ─────────────────────────────────────────────
-- Users manage their own profile.
-- Public read allowed for spots_share_token lookups (shared lists).
CREATE POLICY "user_profiles_select_own_or_public"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id OR spots_is_public = true);

CREATE POLICY "user_profiles_insert_own"
  ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles_update_own"
  ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- ── user_venue_interactions ───────────────────────────────────
-- Any client can insert (anonymous sessions included).
-- Users can read and update their own rows.
-- Service role has full access (for aggregate-venue-signals).
CREATE POLICY "uvi_insert_any"
  ON user_venue_interactions FOR INSERT WITH CHECK (true);

CREATE POLICY "uvi_select_own"
  ON user_venue_interactions FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "uvi_update_own"
  ON user_venue_interactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "uvi_delete_own"
  ON user_venue_interactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "uvi_service_all"
  ON user_venue_interactions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── skip_history ──────────────────────────────────────────────
-- Authenticated users only — suppress their own discovery feed.
CREATE POLICY "skip_history_select_own"
  ON skip_history FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "skip_history_insert_own"
  ON skip_history FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "skip_history_delete_own"
  ON skip_history FOR DELETE USING (auth.uid() = user_id);

-- ── user_events ───────────────────────────────────────────────
-- Any client can insert events (anonymous analytics).
-- Users can read their own events.
-- Service role has full access (for aggregate-venue-signals).
CREATE POLICY "user_events_insert_any"
  ON user_events FOR INSERT WITH CHECK (true);

CREATE POLICY "user_events_select_own"
  ON user_events FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "user_events_service_all"
  ON user_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── venue_signals ─────────────────────────────────────────────
-- Public read (displayed on venue cards / discovery).
-- Service role write only (written by aggregate-venue-signals).
CREATE POLICY "venue_signals_public_read"
  ON venue_signals FOR SELECT USING (true);

CREATE POLICY "venue_signals_service_write"
  ON venue_signals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── constellations ────────────────────────────────────────────
-- Visible constellations are public.
-- Owner or service role can update.
CREATE POLICY "constellations_public_read"
  ON constellations FOR SELECT
  USING (is_visible = true OR auth.uid() = created_by_user_id);

CREATE POLICY "constellations_auth_insert"
  ON constellations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = 'service_role');

CREATE POLICY "constellations_owner_update"
  ON constellations FOR UPDATE
  USING (auth.uid() = created_by_user_id OR auth.role() = 'service_role');

CREATE POLICY "constellations_service_all"
  ON constellations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── constellation_validations ─────────────────────────────────
-- Any client can vote (anonymous validation supported).
-- Users can read their own votes.
-- Service role has full access.
CREATE POLICY "cv_insert_any"
  ON constellation_validations FOR INSERT WITH CHECK (true);

CREATE POLICY "cv_select_own"
  ON constellation_validations FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "cv_service_all"
  ON constellation_validations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── reviews ───────────────────────────────────────────────────
-- Public read. Service role write (ingestion pipeline).
CREATE POLICY "reviews_public_read"
  ON reviews FOR SELECT USING (true);

CREATE POLICY "reviews_service_write"
  ON reviews FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── reviews_sentiment ─────────────────────────────────────────
-- Public read. Service role write (analysis pipeline).
CREATE POLICY "reviews_sentiment_public_read"
  ON reviews_sentiment FOR SELECT USING (true);

CREATE POLICY "reviews_sentiment_service_write"
  ON reviews_sentiment FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── search_history ────────────────────────────────────────────
-- Any client can insert (anonymous searches logged).
-- Users read their own history.
CREATE POLICY "search_history_insert_any"
  ON search_history FOR INSERT WITH CHECK (true);

CREATE POLICY "search_history_select_own"
  ON search_history FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

COMMIT;
