import { useState, useCallback, useRef } from 'react';
import { useSpots } from '@/hooks/useSpots';
import { getAnonId, getSessionId } from '@/lib/identity';
import { supabase } from '@/integrations/supabase/client';
import { logEvent } from '@/lib/logEvent';

/**
 * Hook that maps discovery feed gestures to the new 4-way interaction system.
 * All interactions log to console with TODO markers for future backend wiring.
 */
export function useDiscoveryInteractions() {
  const { saveSpot, removeSpot, updateLabels, isSaved, getLabels, isAuthenticated } = useSpots();
  const [pendingAction, setPendingAction] = useState(null);
  const executingRef = useRef(false);

  const writeInteraction = useCallback(async (venue, interactionType, rating = null) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    if (!placeId) return;

    const anonId = getAnonId();
    const { data: { user } } = await supabase.auth.getUser();

    await Promise.allSettled([
      // Append to user_events (analytics)
      logEvent(interactionType, {
        venue_id: placeId,
        metadata: rating ? { rating } : {},
      }),
      // Upsert to user_venue_interactions (current state)
      supabase.from('user_venue_interactions').upsert(
        {
          user_id: user?.id || null,
          anonymous_id: anonId,
          venue_id: placeId,
          interaction_type: interactionType,
          rating: rating,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,venue_id' }
      ),
    ]);
  }, []);

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

    writeInteraction(venue, 'interested');

    if (!isAuthenticated) {
      setPendingAction({ venue, label: 'Interested' });
      return false;
    }
    await saveWithLabel(venue, 'Interested');
    return true;
  }, [isAuthenticated, saveWithLabel, writeInteraction]);

  const handleNotInterested = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'venue_not_interested', venue_id: placeId, timestamp: Date.now() });

    writeInteraction(venue, 'not_interested');

    if (!isAuthenticated) {
      setPendingAction({ venue, label: 'Not Interested' });
      return false;
    }
    await saveWithLabel(venue, 'Not Interested');
    return true;
  }, [isAuthenticated, saveWithLabel, writeInteraction]);

  const handleSkip = useCallback((venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'venue_skipped', venue_id: placeId, timestamp: Date.now() });

    try {
      const raw = sessionStorage.getItem('whatspot_skipped_venues');
      const existing = raw ? JSON.parse(raw) : [];
      const id = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
      if (id && !existing.includes(id)) {
        sessionStorage.setItem('whatspot_skipped_venues', JSON.stringify([...existing, id]));
      }
    } catch {}

    writeInteraction(venue, 'skipped');

    // Skip does not save — just log and advance
    return true;
  }, [writeInteraction]);

  const handleRated = useCallback(async (venue, rating) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    // TODO: Wire to Supabase user_venue_interactions table — do not implement yet.
    console.log('[TODO: wire to backend]', { event: 'venue_rated', venue_id: placeId, rating, timestamp: Date.now() });

    writeInteraction(venue, 'rated', rating);

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
  }, [isAuthenticated, saveWithLabel, writeInteraction]);

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
    clearPending,
    isAuthenticated,
  };
}
