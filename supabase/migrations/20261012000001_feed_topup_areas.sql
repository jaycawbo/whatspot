-- Feed top-up cooldown and shortfall log (issue #409).
-- One row per ~2 km area (0.02 degree cell) + price/cuisine filter combination. recommend's
-- maybeTopUpFromGoogle reads and writes it with the service role; no client access.
--   exhausted_until   Google had fewer than 10 top-tier venues here, or fewer than 3 new ones: no top-up until this time (90 days)
--   last_called_at    last Google call (no repeat within 24 h)
--   shortfall_count   how often the feed came up short here, skipped calls included. Monitor this
--                     to judge whether the 10-venue threshold is too strict.
CREATE TABLE IF NOT EXISTS feed_topup_areas (
  area_key          text NOT NULL,
  filter_key        text NOT NULL,
  last_called_at    timestamptz,
  last_returned     integer,
  exhausted_until   timestamptz,
  shortfall_count   integer NOT NULL DEFAULT 0,
  last_shortfall_at timestamptz,
  PRIMARY KEY (area_key, filter_key)
);

ALTER TABLE feed_topup_areas ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

-- Monitoring:
--   select area_key, filter_key, shortfall_count, last_returned, exhausted_until, last_called_at
--   from feed_topup_areas order by shortfall_count desc limit 50;
