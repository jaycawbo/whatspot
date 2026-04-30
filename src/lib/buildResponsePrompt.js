import { supabase } from '@/integrations/supabase/client';

const FALLBACK = {
  conversational_response: '',
  venue_copy: [],
  refinement_suggestions: [],
};

export async function buildResponsePrompt({
  venues = [],
  originalQuery = '',
  vibeKeywords = [],
  conversationHistory = [],
}) {
  const fallback = {
    ...FALLBACK,
    venue_copy: venues.map(v => ({ place_id: v.place_id, why_recommended: '' })),
  };

  if (!venues.length) return fallback;

  const venuePayload = venues.map(v => ({
    place_id: v.place_id,
    name: v.name,
    address: v.address,
    price_level: v.price_level ?? null,
    rating: v.rating ?? null,
    review_count: v.review_count ?? null,
    types: v.types ?? [],
  }));

  console.log('[buildResponsePrompt] sending', venuePayload.length, 'venues');

  try {
    const { data, error } = await supabase.functions.invoke('generate-response', {
      body: { venues: venuePayload, originalQuery, vibeKeywords, conversationHistory },
    });

    console.log('[buildResponsePrompt] error:', error, '| conv_response length:', data?.conversational_response?.length);
    if (error || !data) return fallback;
    return data;
  } catch {
    return fallback;
  }
}
