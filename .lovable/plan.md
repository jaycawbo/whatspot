

## Fix: Discovery Feed Buffer Exhaustion (Skeleton Appearing at Swipe 7 and 13)

### Root Cause (from network traffic)

The prefetch API calls only send `whatspot_skipped_venues` as `exclude_ids`. This means the API keeps returning venues already displayed in the deck. After client-side deduplication removes them, each prefetch batch adds only 0-2 genuinely new venues instead of 5-12. The buffer drains in ~7 swipes.

Evidence from the captured network requests:
- Prefetch at 04:29:52 excluded 16 skipped IDs but returned "Brass Taps Pizza Pub" and "Fran's Restaurant" which were already in the active deck
- Prefetch at 04:29:55 excluded 18 IDs but returned "The Jason George" and "Church St. Garage Bar" which were in the previous prefetch response
- After dedup, effectively ~2 new venues per batch instead of ~10

### Fix (3 files)

**File 1: `src/hooks/useDiscoveryFeed.js`**

- Track ALL venue IDs ever sent to the client in a session-level ref (`allServedIdsRef` — a Set)
- Populate it from initial fetch results, reserve venues, and prefetched venues
- In `prefetchNextBatch`, send the full `allServedIdsRef` set as `exclude_ids` (not just skipped venues)
- This ensures the API never returns a venue the user has already seen or that's already queued in the buffer

**File 2: `src/pages/Home.jsx`**

- No major changes needed — the existing `deduplicateVenues` and `activeIds` logic is sound
- Minor: pass `activeIds` to `prefetchNextBatch` so it can merge them into excludes if needed

**File 3: `src/components/discovery/DiscoveryDeck.jsx`**

- Replace fragile prefix-based append detection (`newIds.startsWith(currentIds)`) with a smarter approach: check if the new venue list contains the current card's ID at or after the current position. If so, adjust index to maintain position rather than resetting to 0
- This prevents the deck from resetting when dedup reorders venues

### Technical Detail

The core fix is one line in `prefetchNextBatch` — changing the exclude list from "only skipped" to "all served":

```text
Before: exclude_ids = whatspot_skipped_venues (16 IDs)
After:  exclude_ids = allServedIdsRef (all ~30+ IDs ever returned)
```

This alone ensures each prefetch returns genuinely new venues, keeping the buffer 15-20 cards ahead.

