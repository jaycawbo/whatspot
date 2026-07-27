alter table public.user_events
  add column if not exists venue_name text;
