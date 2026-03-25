

## Been To Dialog: Two-Step Rating Redesign

### File to modify
`src/components/discovery/ConstellationsSheet.jsx` — single file, no protected files touched.

### Design

**Step 1 — Binary Rating Dialog (replaces current 3-button layout)**

Horizontal two-zone layout inside the existing Drawer:

```text
┌─────────────────────────────────────┐
│       "Swipe or tap to rate"        │
│                                     │
│   ← 👎 Didn't Like  │  Liked It 👍 →│
│                                     │
└─────────────────────────────────────┘
```

- Left zone: ThumbsDownIcon + "Didn't Like It" + left arrow
- Right zone: ThumbsUpIcon + "Liked It" + right arrow
- Subtle vertical divider between zones
- Remove the third "Favourites" button and swipe-up gesture entirely
- Remove cancel button (tapping outside drawer dismisses)

Swipe gestures (horizontal only, 80px threshold):
- Swipe right → `onRate('liked')` then show Favourites follow-up
- Swipe left → `onRate('disliked')` and dismiss
- Tap either zone triggers same action as corresponding swipe

Overlays: green for right, muted red/destructive for left (same pattern as current).

**Step 2 — Favourites Follow-Up Dialog**

After a "liked" action, instead of immediately closing, transition to a second view within the same Drawer:

```text
┌─────────────────────────────────────┐
│       "Add to Favourites?"          │
│                                     │
│            ♡ (heart)                │
│                                     │
│      ━━━━━━━━━━━━ (4s bar)         │
└─────────────────────────────────────┘
```

- Outlined heart icon, fills with primary green on tap
- Thin progress bar depleting over 4 seconds using `useEffect` + interval
- Tap heart → call `onRate('loved')`, dismiss
- Timer expires or tap outside → dismiss (venue stays as "liked")
- Uses `AnimatePresence` to crossfade between step 1 and step 2

### Implementation details

- Add `dialogStep` state: `'rate'` | `'favourites'`
- On swipe-right/tap-liked: call `onRate('liked')`, set `dialogStep = 'favourites'`
- On swipe-left/tap-disliked: call `onRate('disliked')`, close drawer
- FavouritesFollowUp component: 4-second countdown via `setInterval`, auto-closes on expiry
- Heart tap: call `onRate('loved')`, close drawer
- Keep ThumbsDownIcon and ThumbsUpIcon SVGs, remove DoubleThumbsUpIcon
- Add a simple heart SVG icon for the favourites step
- Remove `y` motion value and up-swipe logic entirely — only horizontal drag remains

### Rating flow mapping (unchanged in useDiscoveryInteractions.js)
- `'disliked'` → "Didn't Like It" list
- `'liked'` → "Liked It" list
- `'loved'` → "Favourites" list

The hook is a protected file and already handles all three ratings correctly — no changes needed there.

