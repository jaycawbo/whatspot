-- Bronco Phase 1: Request table triggers
-- Implements server-side state machine for requests.
-- All status transitions are authoritative here; clients never write status directly.

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER 1: set_request_expiry
-- Fires BEFORE INSERT to compute expires_at from the venue's acceptance_window_sec.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_request_expiry()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_window_sec integer;
BEGIN
  SELECT acceptance_window_sec INTO v_window_sec
  FROM walkin_venues WHERE id = NEW.venue_id;

  NEW.expires_at := NEW.created_at + (v_window_sec || ' seconds')::interval;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_request_expiry
  BEFORE INSERT ON requests
  FOR EACH ROW EXECUTE FUNCTION set_request_expiry();

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER 2: on_request_accepted
-- Fires AFTER UPDATE when status transitions pending → accepted.
-- Atomically: sets accepted_at + holding_expires_at, cancels competing diner
-- requests, and recomputes avg_response_sec on the venue.
--
-- Recursion safety: the UPDATE on the accepted row re-fires this trigger, but
-- OLD.status will be 'accepted' on the second firing so the IF is false.
-- Avg timing: accepted_at is set by the first UPDATE before the AVG select runs,
-- so the rolling average correctly includes the current request.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION on_request_accepted()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_holding_window_min integer;
  v_now                timestamptz := now();
  v_avg_response_sec   numeric;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN

    SELECT holding_window_min INTO v_holding_window_min
    FROM walkin_venues WHERE id = NEW.venue_id;

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

    UPDATE walkin_venues
    SET avg_response_sec = ROUND(v_avg_response_sec)::integer
    WHERE id = NEW.venue_id;

  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER on_request_accepted
  AFTER UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION on_request_accepted();

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER 3: on_request_expired
-- Fires AFTER UPDATE when status transitions pending → expired.
-- No DB writes. Stub hook for Edge Functions to attach notification logic to.
-- Supabase Realtime broadcasts the row change automatically.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION on_request_expired()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_request_expired
  AFTER UPDATE ON requests
  FOR EACH ROW
  WHEN (NEW.status = 'expired' AND OLD.status = 'pending')
  EXECUTE FUNCTION on_request_expired();
