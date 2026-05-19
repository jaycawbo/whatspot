-- Merge walkin_venues columns into venues table.
-- walkin_venues was empty (no data), so no data migration is needed.
-- All FK tables (venue_users, requests, waitlist_entries, venue_integrations)
-- are also empty in dev, so constraints can be dropped and recreated cleanly.

-- ---------------------------------------------------------------------------
-- 1. Add walk-in columns to venues
-- ---------------------------------------------------------------------------

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS is_available          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS walk_in_capacity      integer     NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS acceptance_window_sec integer     NOT NULL DEFAULT 120
    CHECK (acceptance_window_sec IN (60, 120, 180)),
  ADD COLUMN IF NOT EXISTS holding_window_min    integer     NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS sms_fallback_number   text,
  ADD COLUMN IF NOT EXISTS avg_response_sec      integer,
  ADD COLUMN IF NOT EXISTS manually_set_at       timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_amount_cents  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_tier     text        NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS subscription_status   text        NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id    text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS monthly_request_count integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_count_reset_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_venues_is_available ON venues (is_available);

-- ---------------------------------------------------------------------------
-- 2. Update trigger functions to read from venues instead of walkin_venues
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_request_expiry()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_window_sec integer;
BEGIN
  SELECT acceptance_window_sec INTO v_window_sec
  FROM venues WHERE id = NEW.venue_id;

  NEW.expires_at := NEW.created_at + (v_window_sec || ' seconds')::interval;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION on_request_accepted()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_holding_window_min integer;
  v_now                timestamptz := now();
  v_avg_response_sec   numeric;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN

    SELECT holding_window_min INTO v_holding_window_min
    FROM venues WHERE id = NEW.venue_id;

    UPDATE requests
    SET accepted_at        = v_now,
        holding_expires_at = v_now + (v_holding_window_min || ' minutes')::interval
    WHERE id = NEW.id;

    UPDATE requests
    SET status = 'cancelled'
    WHERE diner_id = NEW.diner_id
      AND id      != NEW.id
      AND status   = 'pending';

    SELECT AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)))
    INTO v_avg_response_sec
    FROM requests
    WHERE venue_id = NEW.venue_id
      AND status   = 'accepted';

    UPDATE venues
    SET avg_response_sec = ROUND(v_avg_response_sec)::integer
    WHERE id = NEW.venue_id;

  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Drop walkin_venues (CASCADE removes all FK constraints referencing it)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS walkin_venues CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Re-add FK constraints pointing to venues(id)
-- ---------------------------------------------------------------------------

ALTER TABLE venue_users
  ADD CONSTRAINT venue_users_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;

ALTER TABLE requests
  ADD CONSTRAINT requests_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;

ALTER TABLE venue_integrations
  ADD CONSTRAINT venue_integrations_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;

ALTER TABLE waitlist_entries
  ADD CONSTRAINT waitlist_entries_venue_id_fkey
  FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. RLS: Allow venue owners to update walk-in columns on venues
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venues' AND policyname = 'venues_walkin_update_owner'
  ) THEN
    CREATE POLICY "venues_walkin_update_owner" ON venues
      FOR UPDATE
      USING (
        id IN (SELECT venue_id FROM venue_users WHERE user_id = auth.uid())
      );
  END IF;
END $$;
