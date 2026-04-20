import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

const SPOTS_KEY = ['spots'];

// Label → interaction mapping
const LABEL_TO_INTERACTION = {
  'Interested':      { interaction_type: 'interested',    rating: null },
  'Not Interested':  { interaction_type: 'not_interested', rating: null },
  "Didn't Like It":  { interaction_type: 'rated',          rating: 'disliked' },
  'Favourites':      { interaction_type: 'rated',          rating: 'liked' },
  'Been To':         { interaction_type: 'rated',          rating: 'liked' },
};

// Reverse: interaction → display label
function interactionToLabel(interaction_type, rating) {
  if (interaction_type === 'rated') {
    if (rating === 'loved')    return 'Favourites';
    if (rating === 'liked')    return 'Favourites';   // liked and loved both → Favourites
    if (rating === 'disliked') return "Didn't Like It";
  }
  if (interaction_type === 'interested')    return 'Interested';
  if (interaction_type === 'not_interested') return 'Not Interested';
  if (interaction_type === 'skipped')        return 'Not Interested';
  return 'Interested';
}

export function useSpots() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: spots = [], isLoading, error } = useQuery({
    queryKey: SPOTS_KEY,
    queryFn: async () => {
      if (!user) return [];

      // Step 1: fetch interactions
      const { data: interactions, error: intError } = await supabase
        .from('user_venue_interactions')
        .select('id, interaction_type, rating, notes, created_at, venue_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (intError) throw new Error(`Failed to fetch interactions: ${intError.message}`);
      if (!interactions?.length) return [];

      // Step 2: fetch venue data for those interactions.
      // Merge key is google_place_id (venue_id stores this value).
      // TODO: migrate venue_id to reference venues.id (UUID) if/when multi-source support is added.
      const venueIds = interactions.map((r) => r.venue_id).filter(Boolean);
      const { data: venueRows, error: venueError } = await supabase
        .from('venues')
        .select('*')
        .in('google_place_id', venueIds);
      if (venueError) throw new Error(`Failed to fetch venue data: ${venueError.message}`);

      const venueMap = Object.fromEntries(
        (venueRows || []).map((v) => [v.google_place_id, v])
      );

      return interactions.map((row) => ({
        ...(venueMap[row.venue_id] || {}),
        favoriteId: row.id,
        labels: [interactionToLabel(row.interaction_type, row.rating)],
        interactionType: row.interaction_type,
        rating: row.rating,
        notes: row.notes || null,
        createdAt: row.created_at,
        venueId: row.venue_id,
        google_place_id: row.venue_id,
      }));
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const isSaved = (placeId) => {
    if (!placeId) return false;
    return spots.some((s) => s.google_place_id === placeId);
  };

  const getLabels = (placeId) => {
    const spot = spots.find((s) => s.google_place_id === placeId);
    return spot?.labels || [];
  };

  const getBeenHereRating = (placeId) => {
    if (!placeId) return null;
    const spot = spots.find((s) => s.google_place_id === placeId);
    if (!spot || spot.interactionType !== 'rated') return null;
    return spot.rating || null;
  };

  // Save a venue to Spots
  const saveMutation = useMutation({
    mutationFn: async ({ venue, labels = [] }) => {
      if (!user) throw new Error('Not authenticated');

      const googlePlaceId = venue.place_id?.replace(/^places\//, '') || venue.google_place_id;
      if (!googlePlaceId) throw new Error('No place_id available');

      const firstLabel = labels[0] || 'Interested';
      const mapping = LABEL_TO_INTERACTION[firstLabel] || { interaction_type: 'interested', rating: null };

      const { error: intError } = await supabase
        .from('user_venue_interactions')
        .upsert(
          {
            user_id: user.id,
            anonymous_id: crypto.randomUUID(),
            venue_id: googlePlaceId,
            interaction_type: mapping.interaction_type,
            rating: mapping.rating,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,venue_id' }
        );
      if (intError) throw intError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPOTS_KEY }),
  });

  // Remove a venue from Spots
  const removeMutation = useMutation({
    mutationFn: async (placeId) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_venue_interactions')
        .delete()
        .eq('user_id', user.id)
        .eq('venue_id', placeId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPOTS_KEY }),
  });

  // Update labels for a venue
  const updateLabelsMutation = useMutation({
    mutationFn: async ({ placeId, labels }) => {
      if (!user) throw new Error('Not authenticated');
      const firstLabel = labels[0] || 'Interested';
      const mapping = LABEL_TO_INTERACTION[firstLabel] || { interaction_type: 'interested', rating: null };

      const { error } = await supabase
        .from('user_venue_interactions')
        .update({
          interaction_type: mapping.interaction_type,
          rating: mapping.rating,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('venue_id', placeId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPOTS_KEY }),
  });

  // Move to list — bypasses Favourites guard for explicit user moves
  const moveToListMutation = useMutation({
    mutationFn: async ({ placeId, listName }) => {
      if (!user) throw new Error('Not authenticated');
      const mapping = LABEL_TO_INTERACTION[listName] || { interaction_type: 'interested', rating: null };
      const { error } = await supabase
        .from('user_venue_interactions')
        .update({
          interaction_type: mapping.interaction_type,
          rating: mapping.rating,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('venue_id', placeId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPOTS_KEY }),
  });

  // Update/save a note for a venue
  const updateNoteMutation = useMutation({
    mutationFn: async ({ placeId, notes }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_venue_interactions')
        .update({ notes, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('venue_id', placeId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPOTS_KEY }),
  });

  const saveBeenHereMutation = useMutation({
    mutationFn: async ({ venue, rating }) => {
      if (!user) throw new Error('Not authenticated');
      const googlePlaceId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');
      if (!googlePlaceId) throw new Error('No place_id available');
      const { error } = await supabase
        .from('user_venue_interactions')
        .upsert(
          {
            user_id: user.id,
            anonymous_id: crypto.randomUUID(),
            venue_id: googlePlaceId,
            interaction_type: 'rated',
            rating,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,venue_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPOTS_KEY }),
  });

  const allLabels = [...new Set(spots.flatMap((s) => s.labels || []))];

  const saveOrUpdateLabel = async ({ venue, label }) => {
    if (!user) throw new Error('Not authenticated');
    const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');
    const currentLabels = getLabels(placeId);
    if (currentLabels.includes('Favourites') && label !== 'Favourites') return;
    if (isSaved(placeId)) {
      await updateLabelsMutation.mutateAsync({ placeId, labels: [label] });
    } else {
      await saveMutation.mutateAsync({ venue, labels: [label] });
    }
  };

  return {
    spots,
    isLoading,
    error,
    isSaved,
    getLabels,
    saveSpot: saveMutation.mutateAsync,
    removeSpot: removeMutation.mutateAsync,
    updateLabels: updateLabelsMutation.mutateAsync,
    moveToList: moveToListMutation.mutateAsync,
    updateNote: updateNoteMutation.mutateAsync,
    saveOrUpdateLabel,
    getBeenHereRating,
    saveBeenHere: saveBeenHereMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isRemoving: removeMutation.isPending,
    allLabels,
    isAuthenticated: !!user,
  };
}
