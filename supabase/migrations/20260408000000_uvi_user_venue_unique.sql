-- Add UNIQUE (user_id, venue_id) to user_venue_interactions.
-- Required for upsert with onConflict: 'user_id,venue_id' in useSpots.js.
-- Deduplicates first (keeps most recent row per user+venue) to avoid constraint violation.

DELETE FROM user_venue_interactions
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, venue_id) id
  FROM user_venue_interactions
  WHERE user_id IS NOT NULL
  ORDER BY user_id, venue_id, updated_at DESC
);

ALTER TABLE user_venue_interactions
  ADD CONSTRAINT uvi_user_venue_key UNIQUE (user_id, venue_id);
