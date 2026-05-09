-- pending_venues: transient holding table for venues selected via autocomplete
-- that are not yet in the main venues table.
-- Populated by the client-side direct search path (issue #127).
-- Never written to from the main venues table or any enrichment pipeline.
-- Admin reviews this table to decide which venues to promote to venues.

create table if not exists public.pending_venues (
  id                uuid          primary key default gen_random_uuid(),
  google_place_id   text          unique not null,
  display_name      text,
  formatted_address text,
  lat               double precision,
  lng               double precision,
  business_status   text,
  created_at        timestamptz   default now(),
  reviewed          boolean       default false
);

-- No public read/write — admin access only.
alter table public.pending_venues enable row level security;
