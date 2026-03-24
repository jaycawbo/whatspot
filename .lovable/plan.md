

## Combined Fix: Crash After ~15 Swipes + Duplicate Venues + Seamless Endless Swiping

### Problems
1. **White screen after ~15 swipes** — `currentIndex` exceeds `venues.length`, card renders blank. `moreRequestedRef` is one-shot and never resets.
2. **Duplicate venues in same session** — Prefetched/reserve venues can contain IDs already in the active deck.
3. **Buffer should stay ahead of user** — Loading skeleton is a last resort, not a regular occurrence.

---

### File 1: `src/hooks/useDiscoveryFeed.js`

**Duplicate prevention in drain functions:**
- `getReserveVenues(activeIds)` and `getPrefetchedVenues(activeIds)` accept an optional `Set<string>` of IDs currently in the deck and filter against it (in addition to skipped IDs).

**Auto-chain prefetch for deeper buffer:**
- After `prefetchNextBatch` completes, if `prefetchedVenuesRef.current.length < 15`, immediately chain another prefetch (recursion cap of 3 total retries, up from 2).

---

### File 2: `src/pages/Home.jsx`

**Strict deduplication before passing to deck:**
- Build a `Set` of normalized place IDs from `[...feedVenues, ...reserveVenues]`, filter out duplicates, and pass the deduplicated array to `DiscoveryDeck`.

**Eagerly drain prefetched on mount:**
- In the initial reserve effect, also drain `getPrefetchedVenues()` alongside `getReserveVenues()` so the deck starts with maximum buffer.

**Pass activeIds to drain functions:**
- In `handleRequestMoreVenues`, compute a Set of IDs already in `feedVenues + reserveVenues` and pass it to `getReserveVenues(activeIds)` / `getPrefetchedVenues(activeIds)`.

**Trigger prefetch earlier:**
- After initial drain, immediately call `prefetchNextBatch()` so a third batch is in-flight while the user swipes through the first ~20 cards.

---

### File 3: `src/components/discovery/DiscoveryDeck.jsx`

**Reset `moreRequestedRef` on new venue arrival:**
- In the append path of the `initialVenues` effect (line 89-92), set `moreRequestedRef.current = false` so subsequent triggers can fire. (Already partially done on line 91 but also needs resetting when venues *actually grow*.)

**Lower trigger threshold:**
- Change proactive loading to fire when **5 cards remain** OR **50% of deck consumed**, whichever comes first.

**Clamp `advanceCard`:**
- Prevent `currentIndex` from advancing past `venues.length`. If at the end and no more venues, don't advance.

**Deduplicate on append:**
- When the append path runs, filter incoming venues against IDs already in `venues` state.

**Graceful skeleton fallback:**
- If `currentVenue` is null but `hasMore` is true (rare transient gap), render a pulsing skeleton card matching `DiscoveryCard` dimensions instead of blank white space.

---

### Buffer timeline (why spinner is rare)

```text
Swipe 0:   ~22 cards (12 primary + 10 reserve); prefetch batch 2 starts
Swipe 10:  Batch 2 lands → deck ~34; batch 3 auto-chains
Swipe 17:  5-card threshold → handleRequestMoreVenues drains buffers
Swipe 22:  Batch 3 lands → deck ~46
```

The deck stays 15-20 cards ahead. The skeleton only appears if all prefetch attempts return empty or network stalls.

