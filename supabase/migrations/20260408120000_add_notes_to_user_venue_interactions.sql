-- Notes column added manually via SQL on 2026-04-08
-- Migration file created retroactively for schema tracking
ALTER TABLE user_venue_interactions
ADD COLUMN IF NOT EXISTS notes TEXT;
