import { useState, useCallback, useRef } from 'react';
import { useSpots } from '@/hooks/useSpots';
import { getAnonId, getSessionId } from '@/lib/identity';
import { supabase } from '@/integrations/supabase/client';
import { logEvent, venueSnapshot } from '@/lib/logEvent';
import { upsertSkipHistory } from '@/lib/skipHistory';
import { toast } from 'sonner';

/**
 * Helper: mark a venue ID as "seen" so future API calls exclude it.
 */
function markVenueExcluded(venueId) {
  if (!venueId) return;
  try {
    const raw = sessionStorage.getItem('whatspot_skipped_venues');
    const existing = raw ? JSON.parse(raw) : [];
    if (!existing.includes(venueId)) {
      sessionStorage.setItem('whatspot_skipped_venues', JSON.stringify([...existing, venueId]));
    }
  } catch {}
}

// Interaction type → list label mapping (for list membership transitions)
const INTERACTION_TO_LABEL = {
  interested: 'Interested',
  not_interested: 'Not Interested',
  been_here: null, // been_here maps to rated interactions, handled separately
};

// List-bearing interaction types (transitions from these require removal)
const LIST_INTERACTIONS = new Set(['interested', 'not_interested', 'been_here']);

/**
 * Hook that maps discovery feed gestures to the new 4-way interaction system.
 */
export function useDiscoveryInteractions() {
  const { saveSpot, removeSpot, updateLabels, isSaved, getLabels, isAuthenticated } = useSpots();
  const [pendingAction, setPendingAction] = useState(null);
  const executingRef = useRef(false);
  const undoTimerRef = useRef(null);

  const writeInteraction = useCallback(async (venue, interactionType, rating = null, notes = null) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    if (!placeId) return;

    const anonId = getAnonId();
    const { data: { user } } = await supabase.auth.getUser();

    await Promise.allSettled([
      // Append to user_events (analytics)
      logEvent(interactionType, {
        venue_id: placeId,
        metadata: rating ? { rating } : {},
        ...venueSnapshot(venue),
      }),
      // Upsert to user_venue_interactions (current state)
      supabase.from('user_venue_interactions').upsert(
        {
          user_id: user?.id || null,
          anonymous_id: anonId,
          venue_id: placeId,
          interaction_type: interactionType,
          rating: rating,
          ...(notes !== null ? { notes } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,venue_id' }
      ),
    ]);
  }, []);

  /**
   * Handle list membership transitions when interaction_type changes.
   */
  const handleListTransition = useCallback(async (venue, newInteractionType, previousInteractionType) => {
    if (!previousInteractionType || previousInteractionType === newInteractionType) return;

    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');

    // If previous interaction had a list, remove from it
    if (LIST_INTERACTIONS.has(previousInteractionType) && isSaved(placeId)) {
      // If new type has no list (passive_skip, skip_for_now), remove entirely
      if (newInteractionType === 'passive_skip' || newInteractionType === 'skip_for_now') {
        try { await removeSpot(placeId); } catch {}
      }
    }
  }, [isSaved, removeSpot]);

  /**
   * Write passive_skip when a venue card loads in the feed.
   */
  const writePassiveSkip = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    if (!placeId) return;

    // Fires the instant this card becomes current, regardless of what the user does next —
    // it's a "shown" event, not a "no action taken" one. Log to user_events for both
    // anonymous and authenticated users — fire-and-forget.
    logEvent('card_shown', {
      venue_id: placeId,
      ...venueSnapshot(venue),
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fire-and-forget — don't block UI
    upsertSkipHistory(placeId, 'passive_skip').catch(() => {});
  }, [upsertSkipHistory]);

  /**
   * Delete a skip_history record (for undo).
   */
  const deleteSkipHistory = useCallback(async (venueId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !venueId) return;

    await supabase
      .from('skip_history')
      .delete()
      .eq('user_id', user.id)
      .eq('venue_id', venueId);
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

  /**
   * Show undo snackbar for skip_for_now and not_interested.
   * Returns a cleanup function.
   */
  const showUndoToast = useCallback((venue, interactionType, previousInteractionType) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    const label = interactionType === 'skip_for_now' ? 'Skipped for now' : 'Not interested';

    // Clear any previous undo timer
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    toast(label, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          // Delete skip_history record
          await deleteSkipHistory(placeId);

          // Reverse session storage exclusion
          try {
            const raw = sessionStorage.getItem('whatspot_skipped_venues');
            if (raw) {
              const existing = JSON.parse(raw);
              sessionStorage.setItem(
                'whatspot_skipped_venues',
                JSON.stringify(existing.filter(id => id !== placeId))
              );
            }
          } catch {}

          // Restore previous list membership if applicable
          if (previousInteractionType && LIST_INTERACTIONS.has(previousInteractionType)) {
            const labelMap = {
              interested: 'Interested',
              not_interested: 'Not Interested',
            };
            const restoreLabel = labelMap[previousInteractionType];
            if (restoreLabel) {
              await saveWithLabel(venue, restoreLabel);
            }
          }

          toast('Undone', { duration: 1500 });
        },
      },
    });
  }, [deleteSkipHistory, saveWithLabel]);

  const handleInterested = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');

    markVenueExcluded(placeId);
    writeInteraction(venue, 'interested');

    if (!isAuthenticated) {
      setPendingAction({ venue, label: 'Interested' });
      return false;
    }

    // Upsert skip_history + handle list transition
    const previousType = await upsertSkipHistory(placeId, 'interested');
    await handleListTransition(venue, 'interested', previousType);
    await saveWithLabel(venue, 'Interested');

    // Trigger post-save label microinteraction
    try {
      window.dispatchEvent(new CustomEvent('whatspot:show-label-sheet', { detail: { venue } }));
    } catch {}

    return true;
  }, [isAuthenticated, saveWithLabel, writeInteraction, upsertSkipHistory, handleListTransition]);

  const handleNotInterested = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');

    markVenueExcluded(placeId);
    writeInteraction(venue, 'not_interested');

    if (!isAuthenticated) {
      setPendingAction({ venue, label: 'Not Interested' });
      return false;
    }

    const previousType = await upsertSkipHistory(placeId, 'not_interested');
    await handleListTransition(venue, 'not_interested', previousType);
    await saveWithLabel(venue, 'Not Interested');

    // Show undo toast
    showUndoToast(venue, 'not_interested', previousType);
    return true;
  }, [isAuthenticated, saveWithLabel, writeInteraction, upsertSkipHistory, handleListTransition, showUndoToast]);

  const handleSkip = useCallback(async (venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');

    try {
      const raw = sessionStorage.getItem('whatspot_skipped_venues');
      const existing = raw ? JSON.parse(raw) : [];
      const id = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
      if (id && !existing.includes(id)) {
        sessionStorage.setItem('whatspot_skipped_venues', JSON.stringify([...existing, id]));
      }
    } catch {}

    writeInteraction(venue, 'skipped');

    // Upsert skip_history for authenticated users
    if (isAuthenticated) {
      const previousType = await upsertSkipHistory(placeId, 'skip_for_now');
      await handleListTransition(venue, 'skip_for_now', previousType);

      // Show undo toast
      showUndoToast(venue, 'skip_for_now', previousType);
    }

    return true;
  }, [writeInteraction, isAuthenticated, upsertSkipHistory, handleListTransition, showUndoToast]);

  const handleRated = useCallback(async (venue, rating, notes = null) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');

    markVenueExcluded(placeId);
    writeInteraction(venue, 'rated', rating, notes);

    // liked and loved both → Favourites
    const labelMap = {
      disliked: "Didn't Like It",
      liked: 'Favourites',
      loved: 'Favourites',
    };

    if (!isAuthenticated) {
      setPendingAction({ venue, label: labelMap[rating] });
      return false;
    }

    // Upsert skip_history as been_here
    const previousType = await upsertSkipHistory(placeId, 'been_here');
    await handleListTransition(venue, 'been_here', previousType);
    await saveWithLabel(venue, labelMap[rating]);

    // Trigger post-save label microinteraction for liked/loved
    if (rating === 'liked' || rating === 'loved') {
      try {
        window.dispatchEvent(new CustomEvent('whatspot:show-label-sheet', { detail: { venue } }));
      } catch {}
    }

    return true;
  }, [isAuthenticated, saveWithLabel, writeInteraction, upsertSkipHistory, handleListTransition]);

  const logRatingSheetOpened = useCallback((venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    logEvent('rating_sheet_opened', { venue_id: placeId, ...venueSnapshot(venue) });
  }, []);

  const logRatingSheetCancelled = useCallback((venue) => {
    const placeId = (venue?.place_id || venue?.google_place_id || '').replace(/^places\//, '');
    logEvent('rating_sheet_cancelled', { venue_id: placeId, ...venueSnapshot(venue) });
  }, []);

  const logDescriptorTap = useCallback((venueId, tagText) => {
    logEvent('descriptor_tag_tapped', { venue_id: venueId, metadata: { tag_text: tagText } });
  }, []);

  const logPhotoAdvance = useCallback((venueId, photoIndex) => {
    logEvent('photo_advanced', { venue_id: venueId, metadata: { photo_index: photoIndex } });
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
    writePassiveSkip,
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
