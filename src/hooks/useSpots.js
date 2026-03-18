import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

const SPOTS_KEY = ['spots'];

// Label → interaction mapping
const LABEL_TO_INTERACTION = {
  'Interested': { interaction_type: 'interested', rating: null },
  'Not Interested': { interaction_type: 'not_interested', rating: null },
  "Didn't Like It": { interaction_type: 'rated', rating: 'disliked' },
  'Liked It': { interaction_type: 'rated', rating: 'liked' },
  'Favourites': { interaction_type: 'rated', rating: 'loved' },
};

// Reverse: interaction → label
function interactionToLabel(interaction_type, rating) {
  if (interaction_type === 'rated') {
    if (rating === 'loved') return 'Favourites';
    if (rating === 'liked') return 'Liked It';
    if (rating === 'disliked') return "Didn't Like It";
  }
  if (interaction_type === 'interested') return 'Interested';
  if (interaction_type === 'not_interested') return 'Not Interested';
  if (interaction_type === 'skipped') return 'Not Interested';
  return 'Interested';
}

/**
 * Hook for managing the user's single "Spots" list.
 * Uses user_venue_interactions + venues tables in Supabase.
 */
export function useSpots() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: spots = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: SPOTS_KEY,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_venue_interactions')
        .select('id, interaction_type, rating, created_at, venue_id, venues!fk_uvi_venue(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => {
        const label = interactionToLabel(row.interaction_type, row.rating);
        return {
          favoriteId: row.id,
          labels: [label],
          createdAt: row.created_at,
          venueId: row.venue_id,
          google_place_id: row.venue_id,
          ...row.venues,
        };
      });
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

  // Save a venue to Spots (upsert venue, then write user_venue_interactions)
  const saveMutation = useMutation({
    mutationFn: async ({ venue, labels = [] }) => {
      if (!user) throw new Error('Not authenticated');

      const googlePlaceId = venue.place_id?.replace(/^places\//, '') || venue.google_place_id;
      if (!googlePlaceId) throw new Error('No place_id available');

      // 1. Upsert venue into venues table
      const { error: venueError } = await supabase
        .from('venues')
        .upsert(
          {
            google_place_id: googlePlaceId,
            name: venue.name,
            address: venue.address,
            lat: venue.lat,
            lng: venue.lon ?? venue.lng,
            rating: venue.rating,
            review_count: venue.review_count,
            price_level: venue.price_level ? venue.price_level.length : null,
            photo_url: venue.image_urls?.[0] || null,
            category: venue.category || venue.cuisine_type || null,
            last_fetched: new Date().toISOString(),
          },
          { onConflict: 'google_place_id' }
        );

      if (venueError) throw venueError;

      // 2. Derive interaction from first label
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

  const allLabels = [...new Set(spots.flatMap((s) => s.labels || []))];

  const saveOrUpdateLabel = async ({ venue, label }) => {
    if (!user) throw new Error('Not authenticated');
    const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');
    const currentLabels = getLabels(placeId);

    if (currentLabels.includes('Favourites') && label !== 'Favourites') return;

    if (isSaved(placeId)) {
      const newLabels = [label];
      await updateLabelsMutation.mutateAsync({ placeId, labels: newLabels });
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
    saveOrUpdateLabel,
    isSaving: saveMutation.isPending,
    isRemoving: removeMutation.isPending,
    allLabels,
    isAuthenticated: !!user,
  };
}
