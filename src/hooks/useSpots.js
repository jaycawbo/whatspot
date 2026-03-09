import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

const SPOTS_KEY = ['spots'];

/**
 * Hook for managing the user's single "Spots" list.
 * Uses the favorites + venues tables in Supabase.
 */
export function useSpots() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all user's spots (favorites joined with venue data)
  const {
    data: spots = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: SPOTS_KEY,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('favorites')
        .select('id, labels, created_at, venue_id, venues(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((fav) => ({
        favoriteId: fav.id,
        labels: fav.labels || [],
        createdAt: fav.created_at,
        venueId: fav.venue_id,
        ...fav.venues,
      }));
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Check if a venue is saved (by google_place_id)
  const isSaved = (placeId) => {
    if (!placeId) return false;
    return spots.some((s) => s.google_place_id === placeId);
  };

  // Get labels for a specific venue
  const getLabels = (placeId) => {
    const spot = spots.find((s) => s.google_place_id === placeId);
    return spot?.labels || [];
  };

  // Save a venue to Spots (upsert venue, then create favorite)
  const saveMutation = useMutation({
    mutationFn: async ({ venue, labels = [] }) => {
      if (!user) throw new Error('Not authenticated');

      // Normalize the place_id — strip "places/" prefix for storage
      const googlePlaceId = venue.place_id?.replace(/^places\//, '') || venue.google_place_id;
      if (!googlePlaceId) throw new Error('No place_id available');

      // 1. Upsert venue into venues table
      const { data: venueRow, error: venueError } = await supabase
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
            price_level: venue.price_level ? venue.price_level.length : null, // '$' -> 1, '$$' -> 2, etc.
            photo_url: venue.image_urls?.[0] || null,
            category: venue.category || venue.cuisine_type || null,
            last_fetched: new Date().toISOString(),
          },
          { onConflict: 'google_place_id' }
        )
        .select('id')
        .single();

      if (venueError) throw venueError;

      // 2. Create favorite
      const { error: favError } = await supabase.from('favorites').insert({
        user_id: user.id,
        venue_id: venueRow.id,
        labels,
      });

      if (favError) throw favError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPOTS_KEY }),
  });

  // Remove a venue from Spots
  const removeMutation = useMutation({
    mutationFn: async (placeId) => {
      if (!user) throw new Error('Not authenticated');
      const spot = spots.find((s) => s.google_place_id === placeId);
      if (!spot) return;
      const { error } = await supabase.from('favorites').delete().eq('id', spot.favoriteId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPOTS_KEY }),
  });

  // Update labels for a venue
  const updateLabelsMutation = useMutation({
    mutationFn: async ({ placeId, labels }) => {
      if (!user) throw new Error('Not authenticated');
      const spot = spots.find((s) => s.google_place_id === placeId);
      if (!spot) throw new Error('Venue not in spots');
      const { error } = await supabase
        .from('favorites')
        .update({ labels })
        .eq('id', spot.favoriteId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SPOTS_KEY }),
  });

  // Get all unique labels across all spots
  const allLabels = [...new Set(spots.flatMap((s) => s.labels || []))];

  return {
    spots,
    isLoading,
    error,
    isSaved,
    getLabels,
    saveSpot: saveMutation.mutateAsync,
    removeSpot: removeMutation.mutateAsync,
    updateLabels: updateLabelsMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isRemoving: removeMutation.isPending,
    allLabels,
    isAuthenticated: !!user,
  };
}
