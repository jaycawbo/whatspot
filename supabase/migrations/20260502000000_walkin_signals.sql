-- walkin_signals: stores patron walk-in confidence signals (got_in / turned_away)
-- Used for server-side confidence scoring only; no public reads.

create table if not exists walkin_signals (
  id            uuid        primary key default gen_random_uuid(),
  venue_id      text        not null,
  signal_type   text        not null,
  party_size    int,
  user_id       uuid        references auth.users,
  anonymous_id  text,
  created_at    timestamptz not null default now(),

  constraint walkin_signals_signal_type_check check (signal_type in ('got_in', 'turned_away'))
);

create index walkin_signals_venue_created_idx
  on walkin_signals (venue_id, created_at);

alter table walkin_signals enable row level security;

-- Anyone (authenticated or anonymous) can insert a signal
create policy "walkin_signals_insert"
  on walkin_signals
  for insert
  to anon, authenticated
  with check (true);

-- No public select — signals are read server-side only
