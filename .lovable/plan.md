

## Analysis: Why Filters Aren't Being Applied

### Root Cause

I traced the full filter flow from frontend to backend. Here's what's happening:

**Evidence from the network requests captured in your session**: Every single request body shows `"open_now": true` but **zero** contain a `price_levels` field. The `radius_km` is always `2` (the default). This means your filter changes are either not being sent or not being applied before the search fires.

There are **three distinct issues**:

1. **Frontend: Initial search ignores filters set via category tiles.** When you tap a category tile, `handleSelectCategory` dispatches the query/category but does NOT call `runSearch`. The search only fires when the user submits from the search bar. If the user changes filters in pre-search mode and then searches, `runSearch` reads `state.filters` — but because `useCallback` closes over the filters at creation time, a stale closure can cause the old (default) filters to be sent instead of the updated ones.

2. **Frontend: `handleSearch` doesn't pass current filters explicitly.** `handleSearch` calls `runSearch(q)` with no `overrideFilters`, relying on the closure-captured `state.filters`. Due to React's batching and stale closures, the filters dispatched via `SET_FILTERS` may not yet be reflected in the `state.filters` that `runSearch` reads.

3. **Backend: Price filtering is lenient on `null`.** When Google returns `null` for `price_level` (which is common — see your results where Tricolore and Now & Later have `price_level: null`), the Step 3 filter currently skips those venues since `null` won't match `['$$$', '$$$$']`. But Google's API-level `priceLevels` filter also doesn't filter venues with unknown price levels — they pass through. Per your preference (lenient), we should keep them but down-rank.

### Plan

#### 1. Fix stale filter closure in `runSearch`
In `Home.jsx`, change `runSearch` to always read filters from a ref or pass them explicitly. Use a `useRef` for filters so the latest value is always available inside callbacks:

```
const filtersRef = useRef(state.filters);
filtersRef.current = state.filters;
```

Then in `runSearch`, use `filtersRef.current` instead of `state.filters` when `overrideFilters` is null.

#### 2. Ensure `handleSearch` uses latest filters
When `handleSearch(q)` fires (from SearchBar submit), explicitly pass `state.filters` as the second argument to `runSearch`.

#### 3. Backend: Down-rank (not exclude) venues with missing price data
In Step 3 of `recommend/index.ts`, when `price_levels` filter is active and a venue has `null` price_level, keep it but flag it as `unknownPrice: true`. In Step 4 scoring, apply a 0.7x penalty to unknownPrice venues so they rank below confirmed matches.

#### 4. Backend: Add logging for received filters
Add a console.log at the top of the handler showing exactly what `open_now` and `price_levels` values were received, so we can debug via edge function logs.

#### 5. Keep open_now lenient
Per your preference, venues where open status is unknown (Google doesn't filter them) will still appear but confirmed-open venues will naturally rank higher since Google's `openNow` param biases toward them.

### Files to Change
- `src/pages/Home.jsx` — fix stale closure, pass filters explicitly
- `supabase/functions/recommend/index.ts` — down-rank null-price instead of excluding, add filter debug logging

