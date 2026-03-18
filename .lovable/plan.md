

## Plan: Fix 3 UI Issues in DiscoveryDeck

**Files to modify:** `src/components/discovery/DiscoveryDeck.jsx` only

---

### Fix 1: Drag Animation Boomerang Bug

**Root cause:** In `handleDragEnd` (line 205), `setIsDragging(false)` runs *before* `performAction` executes the exit animation. This re-enables `animate={{ opacity: 1, scale: 1 }}` with `transition={{ duration: 0.4 }}`, causing Framer Motion to fight the drag position. Additionally, `dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}` with `dragElastic: 0.8` means Framer internally snaps the card back to origin on release before the manual `animate(x, exitX)` kicks in.

**Fix:**
- Keep `isDragging = true` during the exit animation. Only set it to `false` inside `advanceCard`.
- In `handleDragEnd`: do NOT call `setIsDragging(false)` at the top. Only set it to false in the snap-back (below-threshold) branch.
- In `advanceCard`: add `setIsDragging(false)`.
- Remove `dragConstraints` and `dragElastic` props entirely — they cause the internal snap-back. The manual threshold logic in `handleDragEnd` already handles the physics.

### Fix 2: Post-Search Instructional Copy Spacing

**Root cause:** The copy uses `absolute bottom-0 translate-y-10` (line 405) which is only ~2.5rem below the card edge, overlapping with the Skip button and the card on mobile.

**Fix:**
- Move the copy further below: use `translate-y-[3.5rem]` so it sits between the card bottom and the Skip button.
- Set `z-30` so it layers above the card on mobile.
- Increase Skip button offset from `4.5rem` to `6rem` when `showSearchCopy` is true.

### Fix 3: "Been Here" Button Spacing

**Root cause:** `top: -4rem` is not enough clearance from category chips above.

**Fix:** Change to `top: -5.5rem` to provide clear separation from both the card and elements above at all tablet/desktop widths.

---

### Technical Detail

All changes are in `DiscoveryDeck.jsx`:
- Lines 129-134 (`advanceCard`): add `setIsDragging(false)`
- Lines 204-221 (`handleDragEnd`): remove top-level `setIsDragging(false)`, only set in snap-back branch
- Lines 342-360 (motion.div): remove `dragConstraints` and `dragElastic`
- Lines 403-408 (instructional copy): adjust positioning classes
- Line 440 (Skip button): increase offset when copy visible
- Line 453 (Been Here button): increase top offset

