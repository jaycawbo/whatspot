

# Migration Plan: Add 4 Analytics Tables with RLS

## Single SQL Migration

One migration creating all four tables, indexes, and RLS policies.

### Tables
1. **user_events** — append-only event log (search, view, save, dismiss, click_map, share)
2. **venue_signals** — aggregated venue metrics (save/dismiss/view counts, rates)
3. **constellations** — grouped venue collections (curated or algorithmic)
4. **constellation_validations** — append-only user validations of constellations

### RLS Pattern

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| user_events | Own rows (`user_id = auth.uid()` OR matching `anonymous_id`) | Authenticated, own `user_id` | None | None |
| venue_signals | All authenticated | Service role only | Service role only | Service role only |
| constellations | All authenticated | Service role only | Service role only | Service role only |
| constellation_validations | Own rows | Authenticated, own `user_id` | None | None |

### Important Notes
- CHECK constraints on `event_type`, `validation_type`, `type`, `source`, `status` as specified
- CHECK constraints on `time_of_day_hour` (0-23) and `day_of_week` (0-6) are safe (immutable comparisons)
- All indexes created as specified
- No existing tables, policies, or frontend files modified
- Foreign keys reference `auth.users(id)` with `ON DELETE SET NULL` as specified

### File
- **Create** migration via database migration tool

