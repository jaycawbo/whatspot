-- Bronco Phase 1: Realtime + venue owner RLS
-- Enables live request updates for both diner and venue portal clients.

-- Add requests table to the Realtime publication so Postgres Changes events fire.
ALTER PUBLICATION supabase_realtime ADD TABLE requests;

-- Venue owners can read requests for their venues.
-- Required for useVenueRequests hook — the existing requests_select_diner policy
-- only covers diners; without this, venue portal queries return empty.
CREATE POLICY "requests_select_venue_owner"
  ON requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM venue_users
      WHERE venue_users.venue_id = requests.venue_id
        AND venue_users.user_id  = auth.uid()
    )
  );
