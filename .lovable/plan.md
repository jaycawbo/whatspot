

## Discovery Card & Interactions — Implementation Plan

### Overview
Build a swipeable venue discovery card component with photo browsing, ghost card stack, drag/swipe interactions (mobile + web), keyboard shortcuts, and automatic Spots saving with the correct label per interaction type.

### New Files

**1. `src/components/discovery/DiscoveryCard.jsx`** — The main card component
- Full-bleed photo zone with left/right tap regions for photo navigation
- Auto-advancing crossfade (4s interval) with dot indicators at top
- Venue name (large, bold), neighbourhood text, 3 hardcoded descriptor pill chips
- HeartButton in top-right corner of photo zone
- Tapping card body (name/neighbourhood/tags area) navigates to `/venue/:placeId`
- Preloads first 2-3 photos on mount via `<link rel="preload">`

**2. `src/components/discovery/DiscoveryDeck.jsx`** — The deck/stack manager
- Renders active card + 2 ghost cards (scaled down, offset, non-interactive) behind it
- Manages card index, advancing to next card on swipe/action completion
- Uses Framer Motion for:
  - Drag gesture handling (unified pointer events — works for touch + mouse)
  - Drag overlay hints: green heart (drag right), red X (drag left), opacity proportional to drag distance
  - Exit animations: card flies off-screen in swipe direction
  - Entry animation: next card scales up from ghost position
- Swipe thresholds: ~100px horizontal for Want to Go / I'll Pass, ~80px down for Viewed
- Web-only: left/right arrow buttons on card edges, skip button at bottom center
- Web-only: hover states on arrow buttons show faint tint overlay on card
- Keyboard shortcuts: Right arrow → Want to Go, Left arrow → I'll Pass, Down/S → Viewed, Enter → Open details
- Empty state when all cards viewed: "You've seen all the top spots nearby" with CTAs

**3. `src/hooks/useDiscoveryInteractions.js`** — Interaction handler hook
- Wraps `useSpots()` save logic
- Exposes: `handleWantToGo(venue)`, `handlePass(venue)`, `handleViewed(venue)`, `handleFavourite(venue)`
- Each handler:
  1. Calls `saveSpot({ venue, labels: ['Want to Go'] })` (or updates label if already saved, with Favourite always superseding)
  2. Logs interaction to console: `console.log('[TODO: wire to backend]', { event: 'venue_want_to_go', venue_id, timestamp })`
  3. Checks `isAuthenticated` — if not, queues the action and opens AuthModal
- Also exposes: `logDescriptorTap(venueId, tagText)`, `logPhotoAdvance(venueId, photoIndex)`

### Modified Files

**4. `src/pages/Home.jsx`** — Add DiscoveryDeck to pre-search state
- Import `DiscoveryDeck`
- In the pre-search section, render `<DiscoveryDeck venues={[]} />` below the logo/search area (empty for now — feed seeding is a later prompt)
- For now, pass `mockVenues` from existing `src/data/mockVenues.js` or hardcoded test data so the component is testable
- The deck will be the primary UI element; category tiles move into the search drawer (later prompt)

**5. `src/hooks/useSpots.js`** — Add `saveOrUpdateLabel` helper
- New method that checks if venue is already saved; if so, updates label (with Favourite superseding); if not, saves with the given label
- This avoids duplicating the upsert-then-label logic across every interaction handler

### Key Technical Decisions

- **Framer Motion `drag`** for unified touch + mouse gesture handling (already in dependencies)
- **No new dependencies** — everything uses Framer Motion, existing UI primitives, and existing Spots infrastructure
- **Ghost cards** are pure visual — rendered as divs with `scale(0.95)`/`scale(0.9)` and slight Y offset, `pointer-events: none`, pulling photo from next venues in queue
- **Photo crossfade** uses absolute-positioned images with opacity transitions (CSS transition, not Framer) toggled by a 4s `setInterval`
- **Venue Details navigation** on card body tap uses `navigate(`/venue/${placeId}`, { state: { venue } })` — same as existing VenueCard. On return (popstate), if no further interaction occurred, auto-save as "Viewed"
- **Descriptor pills** are hardcoded placeholder arrays for now (3 per card); tapping logs to console with TODO
- **All Section 8 events** logged via `console.log` with structured objects and `// TODO: wire to user_interactions table` comments

### What This Does NOT Build
- Feed seeding / API integration (later prompt)
- Descriptor generation from LLM (later prompt)
- Search bar relocation or bottom sheet changes (later prompt)
- Spots filter system changes (later prompt)
- Backend interaction storage (TODO comments only)

