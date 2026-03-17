

# Whatspot — Frontend Shell + PWA Build Plan

## Overview

Build the complete Whatspot frontend UI with mock data, PWA support, and prepare the architecture for future Supabase Edge Function integration. The app is a single-page venue discovery tool with search, category browsing, filtering, and map/list views.

## Current State

- Empty shell: no pages besides `Index.tsx` placeholder and `NotFound.tsx`
- Existing Base44 SDK setup (auth, vite plugin, edge functions for Google Places)
- Existing edge functions for Google Places APIs (will be migrated to Supabase later)
- No Home page, no components, no global state

## Architecture Decisions

- **Routing**: Use the existing `pages.config.js` system with `App.jsx` as the entry point
- **State management**: React Context (`GlobalStateContext`) for app-wide state (location, search query, filters, sort, view mode)
- **Styling**: Tailwind CSS with existing design tokens from `index.css`
- **Maps**: `react-leaflet` for the map view (free, no API key needed)
- **Mock data**: Hardcoded venue results for development; API service layer with easy swap-in points
- **PWA**: `vite-plugin-pwa` for service worker, manifest, and installability

## Build Phases (all frontend shell)

### Phase 1: Foundation

1. **PWA setup** — Add `vite-plugin-pwa`, create `manifest.json` with Whatspot branding, configure service worker for offline caching
2. **GlobalStateContext** — Context provider with: `query`, `category`, `mode` (pre-search/post-search), `sort`, `view` (list/map), `userLocation`, `locationName`, `filters`, `anonymousId`, `suggestedChips`, `searchHistory`
3. **Mock API service** — `src/services/api.ts` with `recommend()` and `recommendPage()` returning realistic mock venue data, matching the spec's response shape
4. **Update `pages.config.js`** — Register `Home` page as main page

### Phase 2: Core Components

5. **Header** — Fixed top bar with logo, location display (editable), clear-search button
6. **SearchBar** — Text input with search/stop icons, centered (pre-search) vs left-aligned (post-search), Enter-to-submit
7. **CategoryTiles** — Grid of emoji+label tiles (Pizza, Coffee, Bars, etc.), clicking populates search bar
8. **RefinementChips** — Horizontal scrollable pills that appear after tile selection, click appends to query
9. **Home page** — Compose Header + SearchBar + CategoryTiles + RefinementChips for pre-search state

### Phase 3: Post-Search UI

10. **ResultsList** — Venue cards with name, address, distance, rating stars, price level, cuisine tag, open/closed badge, image
11. **MapView** — react-leaflet map with venue markers and popups
12. **ViewToggle** — List/map icon toggle
13. **SortToggle** — Relevance/Distance inline toggle
14. **FilterDialog** — Modal with Open Now toggle, price multi-select, cuisine filter, radius slider
15. **SuggestedChips** — AI-generated refinement chips row (mock data)
16. **RelaxationBanner** — Info banner when constraints were loosened
17. **NoResultsPrompt** — Zero-results state with "Relax constraints" button
18. **Pagination** — "More options" button when `has_more` is true

### Phase 4: Modals & Mobile

19. **GatedModal** — Sign-in prompt overlay
20. **LocationConfirmModal** — Detected vs current location chooser
21. **MobileBottomSheet** — Slide-up sheet for mobile post-search with search bar, categories, chips, history
22. **Responsive layout** — Desktop side-by-side vs mobile stacked with bottom sheet

### Phase 5: User Flows & Polish

23. **Location detection** — Browser geolocation → reverse geocode (mock for now) → localStorage persistence
24. **Search history** — localStorage-based, max 10 items, deduped
25. **Cache restore** — Save/restore results from localStorage on navigation
26. **Anonymous ID** — UUID generation and localStorage persistence

## New Dependencies

- `react-leaflet` + `leaflet` — Map rendering
- `vite-plugin-pwa` — PWA support (service worker, manifest)
- `lodash.debounce` or inline debounce — Search debouncing
- `framer-motion` — AnimatePresence for results transitions
- `uuid` — Anonymous ID generation

## File Structure

```text
src/
├── pages/
│   └── Home.jsx                    # Main (only) page
├── components/
│   └── home/
│       ├── Header.jsx
│       ├── SearchBar.jsx
│       ├── CategoryTiles.jsx
│       ├── RefinementChips.jsx
│       ├── ResultsList.jsx
│       ├── VenueCard.jsx
│       ├── MapView.jsx
│       ├── ViewToggle.jsx
│       ├── SortToggle.jsx
│       ├── FilterDialog.jsx
│       ├── SuggestedChips.jsx
│       ├── RelaxationBanner.jsx
│       ├── NoResultsPrompt.jsx
│       ├── GatedModal.jsx
│       ├── LocationConfirmModal.jsx
│       └── MobileBottomSheet.jsx
├── context/
│   └── GlobalStateContext.jsx
├── services/
│   └── api.js                      # Mock API, swap for real later
└── data/
    └── mockVenues.js               # Mock venue data
```

## Technical Notes

- The existing Base44 auth system in `AuthContext.jsx` will be preserved but the app will work without auth (anonymous mode)
- Edge functions in `functions/` will remain as-is; they'll be migrated to Supabase Edge Functions in a later phase
- The `recommend` API will initially return mock data; the service layer is designed so swapping in real API calls requires changing only `src/services/api.js`
- PWA manifest will include app name "Whatspot", appropriate icons, theme color matching the design tokens, and `display: standalone`

