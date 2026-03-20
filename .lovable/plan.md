

## Analysis: Why the deck runs out after 3 swipes

The network data tells the full story:

1. **Initial fetch** (radius 2km, 61 exclude_ids): returns **3 venues**, 0 reserve
2. **Prefetch** (radius 4km, 64 exclude_ids): returns **3 venues**, 0 reserve
3. **Prefetch** (radius 6km, 67 exclude_ids): returns **0 venues**
4. **expandSearch fallback** (radius 4km, 67 exclude_ids): returns **0 venues**

The exclude_ids list has **61+ entries** from previous sessions. Google Places returns max 20 per query (40 raw from the dual food+drink search). After dedup, admission filtering, chain blocklist, and excluding 61 seen venues, only 3 survive. And since `reserve_venues` are built from candidates *not* in `finalVenues`, with only 3 candidates all going to `finalVenues`, reserves are always empty.

**The current scaffolding does NOT complement your vision.** Here's why and what to change:

---

### Problem 1: Backend caps discovery at 8 results from a tiny pool

Line 774 of the recommend function: `finalVenues = candidates.slice(0, 8)`. But `candidates` comes from `dedup(scoredVenues).slice(0, 20)`, and after 61 exclusions there are only ~3 candidates. The cap doesn't matter — the pool is exhausted.

**Fix:** For discovery mode, don't send the entire cumulative `exclude_ids` list. Only send the IDs from the *current session's active deck* (the venues currently visible in the UI), not every venue ever seen. This keeps the exclude list at ~10-15 instead of 60+, leaving plenty of candidates in the pool.

### Problem 2: Discovery returns max 8 + 10 reserve = 18 total per request

Even when the pool isn't exhausted, the backend caps at 8 primary + 10 reserve. For your seamless-swiping vision, the initial load should return more.

**Fix:** For discovery mode, increase the primary result cap from 8 to 12, keeping reserve at 10. This gives 22 venues from a single request — enough for a quick swiper to have ~20 seconds of content while prefetch loads in background.

### Problem 3: Prefetch triggers too late and too slowly

The proactive trigger fires at `max(venues.length - 8, floor(venues.length / 2))`. With only 3 venues, that's `max(-5, 1) = 1` — meaning it fires after the *first* swipe. But by then the async prefetch takes 4-6 seconds, and the user exhausts 3 cards in ~3 seconds.

**Fix:** Fire prefetch immediately after initial venues load (not after half the deck is swiped). This gives the prefetch a head start while the user is still looking at card 1.

---

### Implementation Plan

**File 1: `src/hooks/useDiscoveryFeed.js`**

- Change `exclude_ids` sent to the initial `fetchFeed` to only include IDs from the *current* `whatspot_skipped_venues` (session-cleared on mount), NOT `whatspot_seen_venues`. The seen-venues dedup will happen naturally via the backend's Google Places result overlap.
- Trigger `prefetchNextBatch()` automatically right after the initial fetch completes (inside `fetchFeed` success path for discovery mode), so the second batch is already in-flight while the user views card 1.
- In `prefetchNextBatch`, if the result is empty at the current ring, auto-advance to the next ring and retry once before returning empty.

**File 2: `supabase/functions/recommend/index.ts`**

- For discovery mode only, increase `finalVenues` cap from 8 to 12: `candidates.slice(0, 12)`.
- Keep reserve at 10 (from remaining candidates).
- This means one discovery request can return up to 22 photo-enriched venues.

**File 3: `src/pages/Home.jsx`**

- No structural changes needed — the existing two-phase drain in `handleRequestMoreVenues` and the auto-drain `useEffect` already handle promotion correctly. The upstream fixes (more venues per request + earlier prefetch) solve the actual throughput problem.

**File 4: `src/components/discovery/DiscoveryDeck.jsx`**

- No changes (per your constraint).

---

### Expected result

- Initial load: 12 primary + 10 reserve = **22 venues** immediately in deck
- By the time user swipes card 3, prefetch has already been running for ~4 seconds and returns another 12+ venues
- User never sees a loading spinner within discovery mode unless the entire Toronto area is genuinely exhausted across all radius rings

