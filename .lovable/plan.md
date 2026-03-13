

# Fix: Recommend Function Timeout Causing 0 Results

## Problem
The recommend function completes successfully on the server (~55s) but the client connection drops before receiving the response. The `catch` block silently clears loading state with no error feedback.

## Changes

### 1. Reduce LLM re-ranking batch size (main perf fix)
**File:** `supabase/functions/recommend/index.ts`

Currently Step 4b sends all 20 Google results to the LLM for re-ranking. Cap the batch at **10 venues** (top-scored from Step 4) before sending to the LLM. This should cut the ~35s LLM call roughly in half. The bottom 10 by heuristic score are unlikely to rank higher after LLM evaluation anyway.

### 2. Add client-side timeout + error toast
**File:** `src/pages/Home.jsx`

- Wrap the `recommend()` call with a 45-second timeout using `Promise.race`
- On timeout or network error, show a toast: "Search timed out. Try a simpler query or smaller radius."
- On any error, dispatch `SET_LOADING: false` (already done) but also show feedback

### 3. Add error state to global state
**File:** `src/context/GlobalStateContext.jsx`

- Add `searchError` to state, with `SET_SEARCH_ERROR` action
- Clear it on new search, set it on failure

### 4. Show error in UI
**File:** `src/components/home/NoResultsPrompt.jsx`

- Accept `searchError` prop and show a different message when the search failed vs. genuinely returned 0 results

## Expected Impact
- LLM re-ranking drops from ~35s to ~15-18s for 10 venues
- Total function time: ~30-35s (within typical edge function limits)
- Users get clear feedback if something fails

