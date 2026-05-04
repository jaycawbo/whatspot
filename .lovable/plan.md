

## Fix: Favourites Follow-Up Dialog Not Showing

### Root Cause

In `DiscoveryDeck.jsx` line 216, `handleRate` immediately calls `setRatingSheetOpen(false)` for ALL ratings, including `'liked'`. This closes the drawer before `ConstellationsSheet` can transition to the Favourites follow-up step.

The ConstellationsSheet component already has the two-step logic correctly implemented — `handleLiked` calls `onRate('liked')` then `setDialogStep('favourites')`. But the parent kills the drawer before step 2 renders.

### Fix (single file: `DiscoveryDeck.jsx`)

Modify `handleRate` to only close the sheet for `'disliked'` and `'loved'` ratings. For `'liked'`, leave the sheet open so ConstellationsSheet can show the Favourites follow-up:

```javascript
const handleRate = useCallback(async (rating) => {
  // Only close immediately for disliked and loved (final states)
  // For 'liked', ConstellationsSheet will show the Favourites follow-up
  if (rating !== 'liked') {
    setRatingSheetOpen(false);
  }
  if (!ratingPendingVenue) return;

  const success = await handleRated(ratingPendingVenue, rating);
  if (success === false) {
    setAuthModalOpen(true);
    return;
  }

  // Only advance card for final states
  if (rating !== 'liked') {
    await new Promise((r) => setTimeout(r, 400));
    advanceCard();
  }
}, [ratingPendingVenue, handleRated, advanceCard]);
```

When the Favourites timer expires or heart is tapped, ConstellationsSheet calls `onOpenChange(false)`, which triggers `handleRatingCancel` in the parent — this already handles cleanup. We also need to make sure `handleRatingCancel` advances the card:

```javascript
// In handleRatingCancel, add card advancement
const handleRatingCancel = useCallback(() => {
  setRatingSheetOpen(false);
  if (ratingPendingVenue) {
    advanceCard();
  }
  setRatingPendingVenue(null);
}, [ratingPendingVenue, advanceCard]);
```

### No other files changed. ConstellationsSheet already has the correct two-step flow.

