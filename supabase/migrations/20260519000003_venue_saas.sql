-- Phase 4: A-1 (#180) + A-2 (#181) — Stripe deposit schema and venue SaaS subscription tiers
-- Run in Supabase SQL editor before deploying the corresponding code.
-- Uses IF NOT EXISTS / CREATE OR REPLACE so it is safe to apply even if #180 was run previously.

-- ---------------------------------------------------------------------------
-- walkin_venues: deposit fields (#180)
-- ---------------------------------------------------------------------------

ALTER TABLE walkin_venues
  ADD COLUMN IF NOT EXISTS deposit_amount_cents integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manually_set_at      timestamptz;

-- ---------------------------------------------------------------------------
-- venue_integrations: POS webhook table (#179)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS venue_integrations (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id       uuid        NOT NULL REFERENCES walkin_venues(id) ON DELETE CASCADE,
  provider       text        NOT NULL CHECK (provider IN ('toast', 'lightspeed', 'square')),
  webhook_secret text        NOT NULL,
  settings       jsonb       NOT NULL DEFAULT '{}',
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, provider)
);

ALTER TABLE venue_integrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'venue_integrations' AND policyname = 'venue_integrations_owner'
  ) THEN
    CREATE POLICY "venue_integrations_owner"
      ON venue_integrations FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM venue_users
          WHERE venue_users.venue_id = venue_integrations.venue_id
            AND venue_users.user_id  = auth.uid()
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- requests: note field + Stripe deposit tracking (#180)
-- ---------------------------------------------------------------------------

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS note text CHECK (char_length(note) <= 140);

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS deposit_status           text
    CHECK (deposit_status IN ('authorized', 'captured', 'refunded', 'forfeited')),
  ADD COLUMN IF NOT EXISTS deposit_amount_cents     integer;

-- ---------------------------------------------------------------------------
-- waitlist_entries: hold position table (#175)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid        NOT NULL REFERENCES walkin_venues(id) ON DELETE CASCADE,
  diner_id   uuid        NOT NULL REFERENCES diners(id)        ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'waiting'
             CHECK (status IN ('waiting', 'notified', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'waitlist_entries' AND policyname = 'waitlist_entries_diner'
  ) THEN
    CREATE POLICY "waitlist_entries_diner"
      ON waitlist_entries FOR ALL
      USING (diner_id = auth.uid())
      WITH CHECK (diner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'waitlist_entries' AND policyname = 'waitlist_entries_owner'
  ) THEN
    CREATE POLICY "waitlist_entries_owner"
      ON waitlist_entries FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM venue_users
          WHERE venue_users.venue_id = waitlist_entries.venue_id
            AND venue_users.user_id  = auth.uid()
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- walkin_venues: subscription fields (#181)
-- ---------------------------------------------------------------------------

ALTER TABLE walkin_venues
  ADD COLUMN IF NOT EXISTS subscription_tier      text        NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS subscription_status    text
    CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS monthly_request_count  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_count_reset_at timestamptz NOT NULL DEFAULT date_trunc('month', now());

-- ---------------------------------------------------------------------------
-- check_venue_request_limit: returns true if venue may accept another request (#181)
-- Resets the monthly counter when a new calendar month begins.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_venue_request_limit(p_venue_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier        text;
  v_count       integer;
  v_reset_at    timestamptz;
  v_month_start timestamptz;
BEGIN
  SELECT subscription_tier, monthly_request_count, request_count_reset_at
    INTO v_tier, v_count, v_reset_at
    FROM walkin_venues
   WHERE id = p_venue_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_tier = 'pro' THEN
    RETURN true;
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC');
  IF v_reset_at < v_month_start THEN
    UPDATE walkin_venues
       SET monthly_request_count  = 0,
           request_count_reset_at = v_month_start
     WHERE id = p_venue_id;
    v_count := 0;
  END IF;

  RETURN v_count < 20;
END;
$$;
