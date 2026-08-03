import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

const STATUS_LIST_SETTINGS_KEY = ['statusListSettings'];

export function useStatusListSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: STATUS_LIST_SETTINGS_KEY,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('status_list_settings')
        .select('list_key, is_public, share_token')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const settingsByListKey = Object.fromEntries(settings.map((s) => [s.list_key, s]));

  // Idempotent — materializes a row with default (public) settings the first
  // time a user opens the Edit dialog for a status list, returns the
  // existing row's values otherwise.
  const ensureShareLinkMutation = useMutation({
    mutationFn: async (listKey) => {
      if (!user) throw new Error('Not authenticated');
      const existing = settingsByListKey[listKey];
      if (existing) return existing;
      // Only user_id/list_key are in the payload, so on conflict this only
      // rewrites those two (identical) values — is_public/share_token are
      // left untouched, and take their column DEFAULTs on first insert.
      const { data, error } = await supabase
        .from('status_list_settings')
        .upsert(
          { user_id: user.id, list_key: listKey },
          { onConflict: 'user_id,list_key' }
        )
        .select('list_key, is_public, share_token')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STATUS_LIST_SETTINGS_KEY }),
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ listKey, isPublic }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('status_list_settings')
        .upsert(
          { user_id: user.id, list_key: listKey, is_public: isPublic, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,list_key' }
        )
        .select('list_key, is_public, share_token')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STATUS_LIST_SETTINGS_KEY }),
  });

  return {
    settingsByListKey,
    isLoading,
    ensureShareLink: ensureShareLinkMutation.mutateAsync,
    toggleVisibility: toggleVisibilityMutation.mutateAsync,
  };
}
