

## Backend Changes Plan

### Change 1 — Create `user_venue_interactions` table
Run the provided SQL migration to create the table with columns (id, user_id, anonymous_id, venue_id, interaction_type, rating, created_at, updated_at), unique constraint on (user_id, venue_id), four indexes, RLS enabled, and three policies (select, insert, update scoped to `auth.uid() = user_id`).

**Note:** The `check` constraint on `interaction_type` and `rating` uses immutable string literals, so CHECK is acceptable here (no time-based logic).

### Change 2 — Extend `venue_signals`
Add five new integer columns (`interested_count`, `not_interested_count`, `liked_count`, `disliked_count`, `loved_count`) with `NOT NULL DEFAULT 0` to the existing `venue_signals` table.

Both Change 1 and Change 2 will be executed as a single database migration.

### Change 3 — Update `aggregate-venue-signals` Edge Function
Insert the provided interaction-aggregation block into `supabase/functions/aggregate-venue-signals/index.ts` immediately **after** the existing `venue_signals` upsert (after the `if (upsertError) throw upsertError;` line, around line 95) and **before** the final success log/response. The existing event aggregation logic remains untouched. The new block queries `user_venue_interactions`, groups by `venue_id`, counts by `interaction_type`/`rating`, and upserts the five new columns into `venue_signals`.

