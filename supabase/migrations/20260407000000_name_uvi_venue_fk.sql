-- Name the FK constraint on user_venue_interactions.venue_id so PostgREST
-- can resolve the venues!fk_uvi_venue join hint used in useSpots.js.
--
-- The FK was created inline (unnamed) in 20260327000000_brantford_to_production.sql,
-- causing Postgres to auto-name it user_venue_interactions_venue_id_fkey.

ALTER TABLE user_venue_interactions
  DROP CONSTRAINT IF EXISTS user_venue_interactions_venue_id_fkey;

ALTER TABLE user_venue_interactions
  ADD CONSTRAINT fk_uvi_venue
    FOREIGN KEY (venue_id) REFERENCES venues(google_place_id) ON DELETE CASCADE;
