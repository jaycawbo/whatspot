
create table user_venue_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id uuid not null,
  venue_id text not null,
  interaction_type text not null check (
    interaction_type in ('interested', 'not_interested', 'skipped', 'rated')
  ),
  rating text check (rating in ('disliked', 'liked', 'loved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, venue_id)
);

create index on user_venue_interactions (user_id);
create index on user_venue_interactions (anonymous_id);
create index on user_venue_interactions (venue_id);
create index on user_venue_interactions (interaction_type);

alter table user_venue_interactions enable row level security;

create policy "users can read own interactions"
  on user_venue_interactions for select
  using (auth.uid() = user_id);

create policy "users can upsert own interactions"
  on user_venue_interactions for insert
  with check (auth.uid() = user_id);

create policy "users can update own interactions"
  on user_venue_interactions for update
  using (auth.uid() = user_id);

-- Change 2: Extend venue_signals
alter table venue_signals
  add column if not exists interested_count int not null default 0,
  add column if not exists not_interested_count int not null default 0,
  add column if not exists liked_count int not null default 0,
  add column if not exists disliked_count int not null default 0,
  add column if not exists loved_count int not null default 0;
