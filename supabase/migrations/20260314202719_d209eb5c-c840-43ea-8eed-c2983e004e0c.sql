
-- Table 1: user_events (append-only)
create table public.user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id uuid not null,
  session_id uuid not null,
  event_type text not null check (event_type in ('search','view','save','dismiss','click_map','share')),
  venue_id text,
  search_query text,
  results_returned int,
  position_in_results int,
  time_of_day_hour int check (time_of_day_hour >= 0 and time_of_day_hour <= 23),
  day_of_week int check (day_of_week >= 0 and day_of_week <= 6),
  neighborhood_context text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index on public.user_events (anonymous_id);
create index on public.user_events (user_id);
create index on public.user_events (venue_id);
create index on public.user_events (created_at);
create index on public.user_events (event_type);

alter table public.user_events enable row level security;

create policy "user_events_select_own" on public.user_events
  for select to authenticated
  using (auth.uid() = user_id);

create policy "user_events_insert_own" on public.user_events
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Table 2: venue_signals
create table public.venue_signals (
  venue_id text primary key,
  save_count int not null default 0,
  dismiss_count int not null default 0,
  view_count int not null default 0,
  search_surface_count int not null default 0,
  save_rate float default 0,
  avg_result_position_at_save float,
  top_query_contexts jsonb default '[]',
  top_neighborhoods_saved_from jsonb default '[]',
  peak_day_of_week int,
  peak_hour int,
  constellation_ids uuid[] default '{}',
  last_signal_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.venue_signals enable row level security;

create policy "venue_signals_select_authenticated" on public.venue_signals
  for select to authenticated
  using (true);

create policy "venue_signals_service_all" on public.venue_signals
  for all to service_role
  using (true)
  with check (true);

-- Table 3: constellations
create table public.constellations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('curated','algorithmic')),
  source text not null check (source in ('editorial','user','system')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  venue_ids text[] not null default '{}',
  credibility_score float not null default 0.5,
  validation_count int not null default 0,
  tag_vector jsonb default '[]',
  city text not null,
  neighborhood text,
  status text not null default 'active' check (status in ('active','dormant','archived')),
  is_visible boolean not null default false,
  is_public boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.constellations (city);
create index on public.constellations (status);
create index on public.constellations (type);

alter table public.constellations enable row level security;

create policy "constellations_select_authenticated" on public.constellations
  for select to authenticated
  using (true);

create policy "constellations_service_all" on public.constellations
  for all to service_role
  using (true)
  with check (true);

-- Table 4: constellation_validations (append-only)
create table public.constellation_validations (
  id uuid primary key default gen_random_uuid(),
  constellation_id uuid not null references public.constellations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id uuid not null,
  venue_id text not null,
  validation_type text not null check (validation_type in ('recognized','visited_confirmed','rejected','saved_from_constellation')),
  confidence_delta float not null default 0,
  created_at timestamptz not null default now()
);

create index on public.constellation_validations (constellation_id);
create index on public.constellation_validations (anonymous_id);
create index on public.constellation_validations (venue_id);

alter table public.constellation_validations enable row level security;

create policy "constellation_validations_select_own" on public.constellation_validations
  for select to authenticated
  using (auth.uid() = user_id);

create policy "constellation_validations_insert_own" on public.constellation_validations
  for insert to authenticated
  with check (auth.uid() = user_id);
