

## Plan: Update proactive loading trigger in DiscoveryDeck.jsx

**Single change** in `src/components/discovery/DiscoveryDeck.jsx`:

Replace the proactive loading `useEffect` (around line 95) that triggers at `venues.length - 8` with the new version that uses `Math.max(venues.length - 8, Math.floor(venues.length / 2))` as the trigger point. This ensures prefetch only fires when you've swiped through at least half the deck AND there are ≤8 remaining.

No other files touched.

