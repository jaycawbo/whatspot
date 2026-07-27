alter table public.user_events
  add column if not exists venue_cuisine_type text,
  add column if not exists venue_price_level integer,
  add column if not exists venue_distance_km numeric,
  add column if not exists venue_rating numeric;
