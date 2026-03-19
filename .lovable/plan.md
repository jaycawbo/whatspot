

## Plan: Add prefetchNextBatch to useDiscoveryFeed.js

Three surgical additions to `src/hooks/useDiscoveryFeed.js`. No restructuring.

### Addition 1 — Line 23 (after `reserveVenuesRef`)
Add `const isPrefetchingRef = useRef(false);`

### Addition 2 — Line 129 (after `expandSearch` closing)
Insert the full `prefetchNextBatch` function as specified in the user's message.

### Addition 3 — Line 145 (return object)
Add `prefetchNextBatch` to the returned object.

No other files touched.

