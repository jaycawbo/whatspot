import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logEvent } from '@/lib/logEvent';
import WhatspotLogo from '@/components/brand/WhatspotLogo';
import SharedSpotCard from '@/components/spots/SharedSpotCard';

export default function SharedSpotList() {
  const { shareToken } = useParams();
  const [state, setState] = useState({ loading: true, error: null, list: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_shared_list', { p_token: shareToken });
      if (cancelled) return;
      if (error || data?.error) {
        setState({ loading: false, error: 'not_found', list: null });
        return;
      }
      setState({ loading: false, error: null, list: data });
      logEvent('list_viewed_public', { metadata: { share_token: shareToken } });
    })();
    return () => { cancelled = true; };
  }, [shareToken]);

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Link to="/"><WhatspotLogo size="nav" /></Link>
        <Link to="/" className="text-sm font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {state.loading && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-muted border-t-foreground rounded-full animate-spin" />
          </div>
        )}

        {!state.loading && state.error && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
            <h1 className="text-lg font-semibold text-foreground">This list isn't available</h1>
            <p className="text-sm text-muted-foreground max-w-xs">
              It may be private, or the link may no longer be valid.
            </p>
          </div>
        )}

        {!state.loading && state.list && (
          <>
            <div>
              <h1 className="text-xl font-bold text-foreground">{state.list.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {state.list.spots.length} {state.list.spots.length === 1 ? 'spot' : 'spots'}
              </p>
            </div>
            <div className="space-y-3">
              {state.list.spots.map((spot) => (
                <SharedSpotCard key={spot.google_place_id} spot={spot} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
