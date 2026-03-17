import { useState, useCallback, useRef } from 'react';
import { useSpots } from '@/hooks/useSpots';

/**
 * Hook that maps discovery feed gestures to the new 4-way interaction system.
 * All interactions log to console with TODO markers for future backend wiring.
 */
export function useDiscoveryInteractions() {
  const { saveSpot, removeSpot, updateLabels, isSaved, getLabels, isAuthenticated } = useSpots();
  const [pendingAction, setPendingAction] = useState(null);
  const executingRef = useRef(false);

  const saveWithLabel = useCallback(async (venue, label) => {
    if (!venue) return;
    const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');

    try {
      if (isSaved(placeId)) {
        await updateLabels({ placeId, labels: [label] });
      } else {
        await saveSpot({ venue, labels: [label] });
      }
    } catch (err) {
      console.error('Failed to save interaction:', err);
    }
  }, [saveSpot, updateLabels, isSaved]);

  const handleInterested = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'venue_interested', venue_id: placeId, timestamp: Date.now() });

    if (!isAuthenticated) {
      setPendingAction({ venue, label: 'Interested' });
      return false;
    }
    await saveWithLabel(venue, 'Interested');
    return true;
  }, [isAuthenticated, saveWithLabel]);

  const handleNotInterested = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'venue_not_interested', venue_id: placeId, timestamp: Date.now() });

    if (!isAuthenticated) {
      setPendingAction({ venue, label: 'Not Interested' });
      return false;
    }
    await saveWithLabel(venue, 'Not Interested');
    return true;
  }, [isAuthenticated, saveWithLabel]);

  const handleSkip = useCallback((venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'venue_skipped', venue_id: placeId, timestamp: Date.now() });
    // Skip does not save — just log and advance
    return true;
  }, []);

  const handleRated = useCallback(async (venue, rating) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'venue_rated', venue_id: placeId, rating, timestamp: Date.now() });

    const labelMap = {
      disliked: "Didn't Like It",
      liked: 'Liked It',
      loved: 'Favourites',
    };

    if (!isAuthenticated) {
      setPendingAction({ venue, label: labelMap[rating] });
      return false;
    }
    await saveWithLabel(venue, labelMap[rating]);
    return true;
  }, [isAuthenticated, saveWithLabel]);

  const logRatingSheetOpened = useCallback((venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'rating_sheet_opened', venue_id: placeId, timestamp: Date.now() });
  }, []);

  const logRatingSheetCancelled = useCallback((venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'rating_sheet_cancelled', venue_id: placeId, timestamp: Date.now() });
  }, []);

  const logDescriptorTap = useCallback((venueId, tagText) => {
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'descriptor_tag_tapped', venue_id: venueId, tag_text: tagText, timestamp: Date.now() });
  }, []);

  const logPhotoAdvance = useCallback((venueId, photoIndex) => {
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'photo_advanced', venue_id: venueId, photo_index: photoIndex, timestamp: Date.now() });
  }, []);

  // Execute pending action after auth
  const executePending = useCallback(async () => {
    if (!pendingAction || executingRef.current) return;
    executingRef.current = true;
    try {
      await saveWithLabel(pendingAction.venue, pendingAction.label);
    } finally {
      executingRef.current = false;
    }
    setPendingAction(null);
  }, [pendingAction, saveWithLabel]);

  const clearPending = useCallback(() => setPendingAction(null), []);

  return {
    handleInterested,
    handleNotInterested,
    handleSkip,
    handleRated,
    logRatingSheetOpened,
    logRatingSheetCancelled,
    logDescriptorTap,
    logPhotoAdvance,
    pendingAction,
    executePending,
    clearPending: () => setPendingAction(null),
    isAuthenticated,
  };
}
