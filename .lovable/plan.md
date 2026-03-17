

## Updated Interactions & Constellations Rating System

This is a large frontend-only change spanning 5 files (edit) and 2 new files. No backend changes.

---

### Part A & B — Remove heart, update gestures

**Edit `src/components/discovery/DiscoveryCard.jsx`**
- Remove the `HeartButton` import and its rendering in the photo zone
- No replacement element in the top-right corner

**Edit `src/components/discovery/DiscoveryDeck.jsx`**
- Add swipe-up detection: new `SWIPE_UP_THRESHOLD = 80`, check `offset.y < -SWIPE_UP_THRESHOLD` in `handleDragEnd`
- Add `upOverlayOpacity` transform from `y` motion value
- Add state: `ratingSheetOpen` (boolean), `ratingPendingVenue` (venue object)
- Update `performAction` directions:
  - `right` → logs `venue_interested`
  - `left` → logs `venue_not_interested`
  - `down` → logs `venue_skipped`, card exits, nothing saved
  - `up` → opens rating sheet, card stays and dims (no exit)
- Update drag overlay hints (4 overlays):
  - Right: green with "Interested" label
  - Left: red with "Not Interested" label  
  - Down: grey with "Skip" label
  - Up: blue/purple with star icon and "Rate it" label
- Remove `handleFavourite`, `handleWantToGo`, `handlePass`, `handleViewed` usage from `useDiscoveryInteractions`
- Remove `Heart`, add `Star`, `ChevronUp` imports from lucide

**Update web controls (same file)**
- Left arrow → "Not Interested" (red)
- Right arrow → "Interested" (green)
- Bottom-center Skip button → "Skip" (grey) — keep existing
- Add top-center up-arrow button → "Rate it" (blue/purple)
- Update hover tint overlays for all 4 buttons
- Keyboard: ArrowUp/W → open rating sheet, Escape → cancel rating sheet, ArrowDown/S → skip

**Rating sheet callback:**
- On rating selected (`disliked`/`liked`/`loved`): dismiss sheet, animate card with upward fade-out (opacity→0, y→-100, scale→0.95), advance card, log `venue_rated`
- On cancel: dismiss sheet, restore card opacity, log `rating_sheet_cancelled`

---

### Part C — Constellations Rating Sheet

**New file: `src/components/discovery/ConstellationsSheet.jsx`**
- Uses the Drawer component from `vaul` (already in project)
- Props: `open`, `onOpenChange`, `venueName`, `onRate(rating)`, `onCancel`
- Content:
  - Venue name label
  - "How was it?" prompt
  - Three horizontal rating buttons: 👎 "Didn't Like It", 👍 "Liked It", 👍👍 "Loved It"
  - "Cancel" text link
- On rating tap: calls `onRate('disliked' | 'liked' | 'loved')`
- On cancel or drawer dismiss: calls `onCancel`

---

### Part D — Update useDiscoveryInteractions

**Edit `src/hooks/useDiscoveryInteractions.js`**
- Replace all handler functions with the new interaction types:
  - `handleInterested(venue)` — saves with label "Interested", logs `venue_interested`
  - `handleNotInterested(venue)` — saves with label "Not Interested", logs `venue_not_interested`
  - `handleSkip(venue)` — logs `venue_skipped` only, no save
  - `handleRated(venue, rating)` — maps `disliked`→"Didn't Like It", `liked`→"Liked It", `loved`→"Favourites" label; logs `venue_rated`
- All console logs include `TODO: Wire to Supabase user_venue_interactions table — do not implement yet.`
- Remove old `handleWantToGo`, `handlePass`, `handleViewed`, `handleFavourite`
- Keep `pendingAction`/`executePending` pattern for auth gating

---

### Part E — Updated Spots Page

**Edit `src/pages/Spots.jsx`**
- Replace `STANDARD_FILTERS` with:
  - `Not Interested` · `Interested` · `Didn't Like It` · `Liked It` · `Favourites`
  - Remove "All" and "Viewed" filters
- Default active filter: `Interested` (most useful default)
- Update empty state messages per list as specified in the prompt
- Filter logic: match on `labels` array containing the filter id
- Keep dynamic tags, map view, share, and auth modal unchanged

---

### Part F — Console Logging

All interactions log to console with the exact event names and payloads specified. Every `console.log` call includes the TODO comment for future backend wiring. No Supabase writes, no edge function calls.

---

### Files changed summary

| File | Action |
|------|--------|
| `src/components/discovery/ConstellationsSheet.jsx` | **New** — rating bottom sheet |
| `src/components/discovery/DiscoveryDeck.jsx` | Edit — new gestures, overlays, web controls, rating sheet integration |
| `src/components/discovery/DiscoveryCard.jsx` | Edit — remove HeartButton |
| `src/hooks/useDiscoveryInteractions.js` | Edit — new interaction handlers |
| `src/pages/Spots.jsx` | Edit — new 5-list filter structure + empty states |

