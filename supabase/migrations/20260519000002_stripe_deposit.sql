-- Phase 3/4: POS tables (from #179) + Stripe deposit schema (#180)
-- Run in Supabase SQL editor before deploying the corresponding code.

-- ---------------------------------------------------------------------------
-- walkin_venues additions (from #179 POS integration)
-- ---------------------------------------------------------------------------

ALTER TABLE walkin_venues
  ADD COLUMN IF NOT EXISTS manually_set_at timestamptz;

ALTER TABLE walkin_venues
  ADD COLUMN IF NOT EXISTS deposit_amount_cents integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- venue_integrations (from #179 POS integration)
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
-- requests: note field + Stripe deposit tracking
-- ---------------------------------------------------------------------------

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS note text CHECK (char_length(note) <= 140);

ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS deposit_status text
    CHECK (deposit_status IN ('authorized', 'captured', 'refunded', 'forfeited')),
  ADD COLUMN IF NOT EXISTS deposit_amount_cents integer;
