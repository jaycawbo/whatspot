
Root cause: the recent refactor moved predictive results out of visible React state and into refs, but nothing now promotes those new refs into the deck at the moment they arrive.

What’s happening now:
1. The deck triggers `onRequestMoreVenues()` once around halfway through the 8-card stack.
2. `Home.jsx` immediately drains `getReserveVenues()` and `getPrefetchedVenues()`.
3. Only after that drain does it call `prefetchNextBatch()`, which is async.
4. When the async fetch finishes, the new venues are sitting in `prefetchedVenuesRef`, but no second drain happens, so the UI never receives them.
5. Because `DiscoveryDeck` only triggers proactive loading once per appended batch, the user can swipe through the original 8 cards and hit the empty state even though background results may already exist.

Why it feels worse now:
- The current network response shows `reserve_venues: []`, so this session did not get the 6–10 built-in reserve cards.
- That means continuity depended entirely on predictive prefetch.
- The predictive prefetch is currently “buffering invisibly,” not appending visibly.

Implementation plan:

1. Fix the async handoff in `src/pages/Home.jsx`
- Make `handleRequestMoreVenues` async-aware.
- Drain already-buffered reserve/prefetched venues first and append them immediately.
- Then await `prefetchNextBatch()`.
- After it resolves, drain `getReserveVenues()` + `getPrefetchedVenues()` again and append any newly fetched venues.
- This makes the predictive fetch actually reach the deck instead of staying trapped in refs.

2. Make `src/hooks/useDiscoveryFeed.js` return useful prefetch results
- Update `prefetchNextBatch` to return metadata such as how many visible and reserve venues were fetched.
- This gives `Home.jsx` a reliable way to know whether the predictive request succeeded and whether it should expect a second drain to produce items.

3. Add a no-buffer fallback path
- If `handleRequestMoreVenues` finds nothing buffered before or after the awaited prefetch, trigger the next fallback behavior instead of letting the user hit the empty state silently.
- In discovery mode, that should continue the discovery expansion path rather than relying on the user to manually click “Explore further.”

4. Preserve the seamless append behavior
- Keep `DiscoveryDeck`’s append-vs-reset logic unchanged.
- Once `Home.jsx` appends the newly fetched venues into `venues={[...feedVenues, ...reserveVenues]}`, the deck should naturally continue without resetting the swipe position.

5. Verify the two important runtime cases
- Case A: backend returns reserve venues on first load → deck should start with a larger buffer.
- Case B: backend returns no reserve venues on first load → predictive prefetch should still append before the user reaches the end of the first batch.

Technical note:
This is not primarily a ranking/search problem anymore. The backend is returning valid discovery results, but the current client flow only reads buffered venues before the async prefetch completes. The visible deck runs out while the next batch is sitting in refs off-screen.
