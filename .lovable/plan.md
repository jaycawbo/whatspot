

## Why skipped venues reappear and the ripple expansion isn't working

### Root Causes

**1. Only swipe-down (skip) adds to the exclude list — swipe-left and swipe-right do not.**

`handleSkip` in `useDiscoveryInteractions.js` (line 94-101) writes venue IDs to `whatspot_skipped_venues` in sessionStorage. But `handleInterested` and `handleNotInterested` never write to any exclusion list. Since the API's `exclude_ids` only reads from `whatspot_skipped_venues`, venues swiped left or right will reappear in subsequent fetches.

**2. The initial `fetchFeed()` doesn't use the ring/pass system at all.**

`fetchFeed` uses `radiusRef.current` (default 5km) and sends no `criteria_pass` parameter. Only `prefetchNextBatch` uses the ring/pass progression. So the initial load and any `expandSearch` fallback bypass the entire ripple system — they just double the radius without advancing criteria.

**3. Client-side dedup of already-shown venues is missing.**

When prefetched venues are drained into the deck, there is no dedup against venues already in the current `venues` array. If Google Places returns the same venue at radius 4km that was already shown at radius 2km, it appears again.

---

### Fix Plan

**File 1: `src/hooks/useDiscoveryInteractions.js`**
- In `handleInterested` and `handleNotInterested`, add the venue ID to a new sessionStorage key `whatspot_acted_venues` (separate from skipped so we can distinguish). 
- Actually, simpler: add ALL interacted venue IDs (skip, interested, not interested, rated) to `whatspot_skipped_venues` so they are all excluded from future API calls. Rename nothing — just ensure every interaction path writes to the same exclusion list.

Specific changes:
- `handleSkip` already writes to `whatspot_skipped_venues` — no change needed.
- `handleInterested` (around line 64): after `saveWithLabel`, add the venue ID to `whatspot_skipped_venues`.
- `handleNotInterested` (around line 78): after `saveWithLabel`, add the venue ID to `whatspot_skipped_venues`.
- `handleRated` (around line 109): add the venue ID to `whatspot_skipped_venues`.
- Extract the sessionStorage write into a shared helper to avoid repetition.

**File 2: `src/hooks/useDiscoveryFeed.js`**
- When draining prefetched/reserve venues into `prefetchedVenuesRef` or when `getPrefetchedVenues`/`getReserveVenues` are called, filter out any IDs already in the current `whatspot_skipped_venues` list. This provides client-side dedup as a safety net.
- No changes to the ring/pass progression — it already works correctly in `prefetchNextBatch`. The key fix is ensuring ALL interacted venues are in the exclusion list (File 1).

**File 3: `src/pages/Home.jsx`** — No changes needed.

---

### Expected Result
- Every swiped venue (any direction) is excluded from future API calls and client-side filtering.
- The ripple system (radius rings + criteria passes) continues to work as designed, but now with a complete exclusion list, it will naturally progress to wider radii and relaxed criteria rather than returning the same venues.

