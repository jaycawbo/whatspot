import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

const LABELS_KEY = ['user_labels'];
const VUL_KEY = ['venue_user_labels'];

export function useUserLabels() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: userLabels = [], isLoading } = useQuery({
    queryKey: LABELS_KEY,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_labels')
        .select('id, label_name, created_at, last_used_at')
        .eq('user_id', user.id)
        .order('last_used_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: venueLabels = [] } = useQuery({
    queryKey: VUL_KEY,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('venue_user_labels')
        .select('venue_id, label_id, user_labels(id, label_name)')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Map venue_id → [{ id, label_name }]
  const labelsByVenue = useMemo(() => {
    const map = {};
    for (const row of venueLabels) {
      if (!map[row.venue_id]) map[row.venue_id] = [];
      if (row.user_labels) map[row.venue_id].push(row.user_labels);
    }
    return map;
  }, [venueLabels]);

  const recentLabels = userLabels.slice(0, 3);

  const createLabel = useMutation({
    mutationFn: async (labelName) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('user_labels')
        .upsert(
          { user_id: user.id, label_name: labelName, last_used_at: new Date().toISOString() },
          { onConflict: 'user_id,label_name' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LABELS_KEY }),
  });

  const applyLabel = useMutation({
    mutationFn: async ({ venueId, labelId }) => {
      if (!user) throw new Error('Not authenticated');
      await supabase
        .from('user_labels')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', labelId)
        .eq('user_id', user.id);
      const { error } = await supabase
        .from('venue_user_labels')
        .upsert(
          { venue_id: venueId, label_id: labelId, user_id: user.id },
          { onConflict: 'venue_id,label_id,user_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VUL_KEY });
      queryClient.invalidateQueries({ queryKey: LABELS_KEY });
    },
  });

  const createAndApplyLabel = async ({ venueId, labelName }) => {
    const label = await createLabel.mutateAsync(labelName);
    await applyLabel.mutateAsync({ venueId, labelId: label.id });
    return label;
  };

  const removeLabel = useMutation({
    mutationFn: async ({ venueId, labelId }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('venue_user_labels')
        .delete()
        .eq('venue_id', venueId)
        .eq('label_id', labelId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VUL_KEY }),
  });

  const getVenueLabels = (venueId) => labelsByVenue[venueId] || [];

  return {
    userLabels,
    recentLabels,
    isLoading,
    labelsByVenue,
    getVenueLabels,
    createLabel: createLabel.mutateAsync,
    applyLabel: applyLabel.mutateAsync,
    createAndApplyLabel,
    removeLabel: removeLabel.mutateAsync,
    isApplying: applyLabel.isPending,
  };
}
