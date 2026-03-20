

## Plan: Fix prefetch state conflict & auto-drain reserves on first load

Two targeted changes across two files. No other files touched.

---

### Change 1 — `src/hooks/useDiscoveryFeed.js`

**Add `prefetchedVenuesRef`** alongside existing refs (around line 39):
```js
const prefetchedVenuesRef = useRef([]);
```

**In `prefetchNextBatch`** (line 264-265), replace `setVenues(prev => [...prev, ...filtered])` with:
```js
prefetchedVenuesRef.current = [...prefetchedVenuesRef.current, ...filtered];
```

**Add `getPrefetchedVenues`** function before the return (after `getReserveVenues`):
```js
const getPrefetchedVenues = useCallback(() => {
  const prefetched = prefetchedVenuesRef.current;
  prefetchedVenuesRef.current = [];
  return prefetched;
}, []);
```

**Add `getPrefetchedVenues` to the return object.**

---

### Change 2 — `src/pages/Home.jsx`

**Add `useEffect` import** (already imported as `React` includes it, but add explicit import).

**Add `getPrefetchedVenues` to the destructure** from `useDiscoveryFeed`.

**Update `handleRequestMoreVenues`** to drain both reserves and prefetched:
```js
const handleRequestMoreVenues = useCallback(() => {
  const reserve = getReserveVenues();
  const prefetched = getPrefetchedVenues();
  const combined = [...reserve, ...prefetched];
  if (combined.length > 0) {
    setReserveVenues(prev => [...prev, ...combined]);
  }
  if (!currentQuery) {
    prefetchNextBatch();
  } else if (combined.length === 0) {
    expandSearch();
  }
}, [getReserveVenues, getPrefetchedVenues, prefetchNextBatch, expandSearch, currentQuery]);
```

**Add auto-drain useEffect** to immediately merge reserve venues on first load:
```js
const hasInitializedReserve = useRef(false);

useEffect(() => {
  if (feedVenues.length > 0 && !hasInitializedReserve.current) {
    hasInitializedReserve.current = true;
    const reserve = getReserveVenues();
    if (reserve.length > 0) {
      setReserveVenues(reserve);
    }
  }
}, [feedVenues, getReserveVenues]);
```

This means the deck starts with 14–18 venues (8 primary + 6–10 reserve) immediately, and prefetched batches are cleanly merged via Home.jsx state rather than conflicting with hook-internal state.

