import { useState, useCallback } from 'react';
import { useSpots } from '@/hooks/useSpots';

/**
 * Hook that maps discovery feed gestures to Spots saving with correct labels.
 * Logs all interactions to console with TODO markers for future backend wiring.
 */
export function useDiscoveryInteractions() {
  const { saveSpot, removeSpot, updateLabels, isSaved, getLabels, isAuthenticated } = useSpots();
  const [pendingAction, setPendingAction] = useState(null);

  const saveWithLabel = useCallback(async (venue, label) => {
    if (!venue) return;
    const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');

    try {
      const currentLabels = getLabels(placeId);

      // Favourite always supersedes
      if (currentLabels.includes('Favourite') && label !== 'Favourite') {
        // Don't downgrade from Favourite
        return;
      }

      if (isSaved(placeId)) {
        // Update label — most recent wins (except Favourite supersedes)
        const newLabels = label === 'Favourite'
          ? ['Favourite']
          : [label];
        await updateLabels({ placeId, labels: newLabels });
      } else {
        const labels = [label];
        await saveSpot({ venue, labels });
      }
    } catch (err) {
      console.error('Failed to save interaction:', err);
    }
  }, [saveSpot, updateLabels, isSaved, getLabels]);

  const handleWantToGo = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: wire to user_interactions table
    console.log('[TODO: wire to backend]', { event: 'venue_want_to_go', venue_id: placeId, timestamp: Date.now() });

    if (!isAuthenticated) {
      setPendingAction({ venue, label: 'Want to Go' });
      return false; // Signal caller to show auth modal
    }
    await saveWithLabel(venue, 'Want to Go');
    return true;
  }, [isAuthenticated, saveWithLabel]);

  const handlePass = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: wire to user_interactions table
    console.log('[TODO: wire to backend]', { event: 'venue_passed', venue_id: placeId, timestamp: Date.now() });

    if (!isAuthenticated) {
      setPendingAction({ venue, label: "I'll Pass" });
      return false;
    }
    await saveWithLabel(venue, "I'll Pass");
    return true;
  }, [isAuthenticated, saveWithLabel]);

  const handleViewed = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: wire to user_interactions table
    console.log('[TODO: wire to backend]', { event: 'venue_viewed', venue_id: placeId, timestamp: Date.now() });

    if (!isAuthenticated) {
      setPendingAction({ venue, label: 'Viewed' });
      return false;
    }
    await saveWithLabel(venue, 'Viewed');
    return true;
  }, [isAuthenticated, saveWithLabel]);

  const handleFavourite = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: wire to user_interactions table
    console.log('[TODO: wire to backend]', { event: 'venue_favourited', venue_id: placeId, timestamp: Date.now() });

    if (!isAuthenticated) {
      setPendingAction({ venue, label: 'Favourite' });
      return false;
    }
    await saveWithLabel(venue, 'Favourite');
    return true;
  }, [isAuthenticated, saveWithLabel]);

  const logDescriptorTap = useCallback((venueId, tagText) => {
    // TODO: wire to user_interactions table
    console.log('[TODO: wire to backend]', { event: 'descriptor_tag_tapped', venue_id: venueId, tag_text: tagText, timestamp: Date.now() });
  }, []);

  const logPhotoAdvance = useCallback((venueId, photoIndex) => {
    // TODO: wire to user_interactions table
    console.log('[TODO: wire to backend]', { event: 'photo_advanced', venue_id: venueId, photo_index: photoIndex, timestamp: Date.now() });
  }, []);

  // Execute pending action after auth
  const executePending = useCallback(async () => {
    if (!pendingAction) return;
    await saveWithLabel(pendingAction.venue, pendingAction.label);
    setPendingAction(null);
  }, [pendingAction, saveWithLabel]);

  return {
    handleWantToGo,
    handlePass,
    handleViewed,
    handleFavourite,
    logDescriptorTap,
    logPhotoAdvance,
    pendingAction,
    executePending,
    clearPending: () => setPendingAction(null),
    isAuthenticated,
  };
}
