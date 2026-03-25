

## Fix: ConstellationsSheet Prop Mismatch

### Problem
`DiscoveryDeck.jsx` passes `venue` (full object) and no `onCancel` to `ConstellationsSheet`, but the component destructures `{ venueName, onCancel }`. This means the venue name shows as blank/undefined and cancel doesn't fire properly.

`DiscoveryDeck.jsx` is a protected file, so the fix must be in `ConstellationsSheet.jsx`.

### File to modify
`src/components/discovery/ConstellationsSheet.jsx`

### Change
Update the component signature to accept either `venue` (object) or `venueName` (string) for backward compatibility:

```jsx
export default function ConstellationsSheet({ open, onOpenChange, venue, venueName, onRate, onCancel }) {
  const displayName = venueName || venue?.name || venue?.displayName?.text || 'This place';
  // ...pass displayName to SwipeableRatingCard
}
```

This is a one-line destructuring fix plus a fallback derivation. No other files change. No protected files touched.

