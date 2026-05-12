-- Project Bronco Phase 1, A-1: Schema + RLS
-- Creates walkin_venues, venue_users, diners, and requests tables.
-- NOTE: Table is named walkin_venues (not venues) to avoid collision with the
-- existing discovery venues table (PK: google_place_id text).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- walkin_venues
-- Restaurants registered on the Bronco walk-in platform.
-- google_place_id links to the existing discovery venues table when available.
-- ---------------------------------------------------------------------------

CREATE TABLE walkin_venues (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id       text        REFERENCES venues(google_place_id),
  name                  text        NOT NULL,
  address               text        NOT NULL,
  coordinates           geography(Point, 4326) NOT NULL,
  category              text        CHECK (category IN ('food','drinks','coffee','bakery','bar')),
  operating_hours       jsonb,
  walk_in_capacity      integer     NOT NULL DEFAULT 4,
  acceptance_window_sec integer     NOT NULL DEFAULT 120
                        CHECK (acceptance_window_sec IN (60, 120, 180)),
  holding_window_min    integer     NOT NULL DEFAULT 30,
  is_available          boolean     NOT NULL DEFAULT false,
  sms_fallback_number   text,
  avg_response_sec      integer,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- venue_users
-- Join table used by RLS to determine which auth users own which walkin_venues.
-- ---------------------------------------------------------------------------

CREATE TABLE venue_users (
  venue_id uuid NOT NULL REFERENCES walkin_venues(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  PRIMARY KEY (venue_id, user_id)
);

-- ---------------------------------------------------------------------------
-- diners
-- Diner profiles linked 1:1 to auth.users.
-- ---------------------------------------------------------------------------

CREATE TABLE diners (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id),
  name       text        NOT NULL,
  phone      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- requests
-- Walk-in request state machine.
-- expires_at must be set by the caller (created_at + acceptance_window_sec).
-- holding_expires_at is set on acceptance (accepted_at + holding_window_min * 60s).
-- All status transitions are server-side only; no UPDATE policy for authed users.
-- ---------------------------------------------------------------------------

CREATE TABLE requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id           uuid        NOT NULL REFERENCES diners(id),
  venue_id           uuid        NOT NULL REFERENCES walkin_venues(id),
  party_size         integer     NOT NULL CHECK (party_size >= 1),
  status             text        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','declined','expired','redeemed','cancelled')),
  decline_comment    text        CHECK (char_length(decline_comment) <= 200),
  created_at         timestamptz NOT NULL DEFAULT now(),
  accepted_at        timestamptz,
  expires_at         timestamptz NOT NULL,
  holding_expires_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE walkin_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE diners        ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests      ENABLE ROW LEVEL SECURITY;

-- walkin_venues: anyone can read; only venue owners can update
CREATE POLICY "walkin_venues_select_public"
  ON walkin_venues FOR SELECT
  USING (true);

CREATE POLICY "walkin_venues_update_owner"
  ON walkin_venues FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM venue_users
      WHERE venue_users.venue_id = walkin_venues.id
        AND venue_users.user_id  = auth.uid()
    )
  );

-- venue_users: users manage their own rows
CREATE POLICY "venue_users_select_own"
  ON venue_users FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "venue_users_insert_own"
  ON venue_users FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- diners: users manage their own profile
CREATE POLICY "diners_select_own"
  ON diners FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "diners_update_own"
  ON diners FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- requests: diner can read their own; INSERT authenticated diners only;
-- no UPDATE policy for normal users — service role handles all status transitions
CREATE POLICY "requests_select_diner"
  ON requests FOR SELECT
  USING (diner_id = auth.uid());

CREATE POLICY "requests_insert_diner"
  ON requests FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND diner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_requests_diner_id        ON requests(diner_id);
CREATE INDEX idx_requests_venue_id        ON requests(venue_id);
CREATE INDEX idx_requests_status          ON requests(status);
CREATE INDEX idx_requests_expires_pending ON requests(expires_at) WHERE status = 'pending';

CREATE INDEX idx_walkin_venues_available  ON walkin_venues(is_available);
CREATE INDEX idx_walkin_venues_category   ON walkin_venues(category);
