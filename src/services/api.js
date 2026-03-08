import { supabase } from '@/integrations/supabase/client';

export async function recommend(params) {
  const { data, error } = await supabase.functions.invoke('recommend', { body: params });
  if (error) throw error;
  return data;
}

export async function recommendPage() {
  return { results: [], pagination: { has_more: false } };
}
