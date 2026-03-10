import { supabase } from '@/integrations/supabase/client';

export async function recommend(params) {
  const { session_context, ...rest } = params;
  const { data, error } = await supabase.functions.invoke('recommend', {
    body: { ...rest, session_context: session_context || [] },
  });
  if (error) throw error;
  return data;
}

export async function recommendPage() {
  return { results: [], pagination: { has_more: false } };
}
