

## Plan: Fix "Been Here" Button Spacing + Instructional Copy Overlap

**File to modify:** `src/components/discovery/DiscoveryDeck.jsx` only

---

### Why Previous Fixes Failed

Both issues share the same root cause: the deck container has a fixed height (`var(--deck-height, 78vh)`) and all elements — buttons, instructional copy — are absolutely positioned inside it using offsets that push them outside the container bounds. But the parent layout (`flex items-center justify-center`) doesn't account for this overflow, so:

- **"Been Here" button** at `top: -5.5rem` bleeds upward into the category chips area because there's no reserved space above the container.
- **Instructional copy** at `bottom-0 translate-y-[3.5rem]` bleeds downward and overlaps the card on mobile (where there's no extra space below) and sits behind the Skip button on desktop.

Adjusting pixel values alone can't fix this — the container needs structural changes to reserve space for these elements.

### Solution

Wrap the deck in a flex column layout that places the "Been Here" button, the card area, and the instructional copy + Skip button in **document flow** rather than relying on absolute offsets that escape the container.

**Structural change to the container (line 332):**

Replace the single `relative` div with a flex column:

```text
┌─────────────────────────┐
│  "Been Here" button     │  ← in flow, not absolute (desktop only)
│  (h-12, mb-3)           │
├─────────────────────────┤
│                         │
│   Card area (flex-1)    │  ← relative container for card + ghost cards + overlays
│                         │
├─────────────────────────┤
│  Instructional copy     │  ← in flow, conditional (mt-3)
│  Skip button            │  ← in flow, below copy (mt-2)
└─────────────────────────┘
```

Specifically:
1. The outer wrapper becomes `flex flex-col` with the same max-width constraints and full height.
2. **"Been Here" button** (desktop only): Moves from `absolute top: -5.5rem` to a normally-flowing element at the top of the flex column, with `mb-3` for spacing. This guarantees it never overlaps the card or elements above.
3. **Card area**: A `relative flex-1` div that contains the ghost cards, active motion card, and swipe overlays. Left/Right buttons remain absolutely positioned on this div since they're horizontally outside.
4. **Instructional copy** (conditional): Moves from absolute positioning to a normal-flow `<p>` below the card area with `mt-3`.
5. **Skip button** (desktop only): Moves from absolute positioning to normal flow below the copy, with `mt-2`.
6. **Mobile**: On mobile, buttons don't render (gated by `!isMobile`). The instructional copy renders below the card in flow with `mt-3`, preventing overlap.

### What stays the same
- Left/Right arrow buttons remain absolute on the card area div (they sit horizontally outside, no vertical overlap issue).
- Hover tint overlay remains absolute `inset-0` on the card area.
- All swipe overlays inside the motion.div stay unchanged.
- No changes to DiscoveryCard.jsx, ConstellationsSheet.jsx, or any other file.

