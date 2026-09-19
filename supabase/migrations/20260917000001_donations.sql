-- Donations: one-time "support WhatSpot" payments via Stripe Checkout (#350)

CREATE TABLE IF NOT EXISTS donations (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_session_id         text        NOT NULL UNIQUE,
  stripe_payment_intent_id  text,
  amount_cents              integer     NOT NULL,
  currency                  text        NOT NULL DEFAULT 'usd',
  donor_email               text,
  status                    text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed')),
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'donations' AND policyname = 'donations_select_own'
  ) THEN
    CREATE POLICY "donations_select_own"
      ON donations FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;
