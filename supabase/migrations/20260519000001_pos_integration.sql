-- Issue #179 - Phase 3: A-2 - POS Integration
-- Adds manually_set_at to walkin_venues and creates venue_integrations table.

-- Track when is_available was last set manually (POS webhook respects this 5-min window)
ALTER TABLE walkin_venues
  ADD COLUMN IF NOT EXISTS manually_set_at timestamptz;

-- POS provider integrations per venue
CREATE TABLE venue_integrations (
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

CREATE POLICY "venue_integrations_select_owner"
  ON venue_integrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM venue_users
      WHERE venue_users.venue_id = venue_integrations.venue_id
        AND venue_users.user_id  = auth.uid()
    )
  );

CREATE POLICY "venue_integrations_insert_owner"
  ON venue_integrations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM venue_users
      WHERE venue_users.venue_id = venue_integrations.venue_id
        AND venue_users.user_id  = auth.uid()
    )
  );

CREATE POLICY "venue_integrations_update_owner"
  ON venue_integrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM venue_users
      WHERE venue_users.venue_id = venue_integrations.venue_id
        AND venue_users.user_id  = auth.uid()
    )
  );

CREATE POLICY "venue_integrations_delete_owner"
  ON venue_integrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM venue_users
      WHERE venue_users.venue_id = venue_integrations.venue_id
        AND venue_users.user_id  = auth.uid()
    )
  );

CREATE INDEX idx_venue_integrations_venue_provider ON venue_integrations(venue_id, provider);
