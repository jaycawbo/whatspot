

## Problem Diagnosis

The discovery feed shows "You've explored all the top spots nearby" despite the API returning 8 venues per request. Two interacting bugs cause this:

1. **`exclude_ids` prefix mismatch** — The client sends venue IDs without the `places/` prefix (e.g., `ChIJz_UU_...`), but the recommend edge function receives Google Places results with the prefix (`places/ChIJz_UU_...`). The backend comparison fails, so "excluded" venues keep being returned.

2. **Accumulated `whatspot_skipped_venues`** — Every venue the user has ever skipped in any session is stored in sessionStorage. The client-side filter (line 149-152 in useDiscoveryFeed.js) strips the `places/` prefix and filters against this list. After enough sessions, most venues within the 2km radius have been skipped, so `filtered` ends up empty even though the API returned 8 results.

The visible network requests confirm this: venues like "Mascot Brewery", "Town Crier", and "LIBRARY BAR" appear both in the `exclude_ids` list AND in the API results, proving the backend isn't filtering them. The client then filters them out as skipped, leaving zero venues.

---

## Fix Plan

### Change 1 — Backend: Fix prefix handling in recommend edge function

**File:** `supabase/functions/recommend/index.ts`

When comparing `exclude_ids` against Google Places results, normalize both sides by stripping the `places/` prefix before comparison. This ensures previously seen venues are actually excluded server-side, so the API returns genuinely new venues.

### Change 2 — Client: Clear skipped venues on new sessions

**File:** `src/hooks/useDiscoveryFeed.js`

In the initial mount effect, clear `whatspot_skipped_venues` from sessionStorage. Skipped venues are a session-level concept — they prevent seeing the same venue again within the current browsing session, not across sessions. The `exclude_ids` mechanism (via `whatspot_seen_venues`) already handles cross-request deduplication within a session.

Add before `fetchFeed()` in the mount effect:
```js
try { sessionStorage.removeItem('whatspot_skipped_venues'); } catch {}
```

### Change 3 — Client: Cap seen venues list to prevent exhaustion

**File:** `src/hooks/useDiscoveryFeed.js`

In `fetchFeed`, cap `whatspot_seen_venues` to the most recent 100 IDs. With only ~50-80 eligible venues in a 2km radius, an unbounded list eventually excludes everything. A rolling window of 100 provides deduplication within the session while allowing venues to resurface naturally.

---

### Technical Detail

These three changes work together:
- Change 1 ensures the backend actually respects exclusions, returning fresh venues
- Change 2 ensures each page load starts with a clean skip list
- Change 3 prevents the seen-venues list from growing large enough to exhaust all options within the radius

