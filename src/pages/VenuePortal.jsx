import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useVenueRequests } from '@/hooks/useRequestRealtime';
import { useAuth } from '@/lib/AuthContext';

// ── helpers ────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// ── Waitlist queue ─────────────────────────────────────────────────────────

function WaitlistQueue({ venueId }) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const { data } = await supabase
        .from('waitlist_entries')
        .select('id, diner_id, created_at, status')
        .eq('venue_id', venueId)
        .eq('status', 'waiting')
        .order('created_at', { ascending: true });
      if (!cancelled) {
        setEntries(data ?? []);
        setIsLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel(`waitlist-${venueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waitlist_entries', filter: `venue_id=eq.${venueId}` },
        () => { load(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [venueId]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading waitlist…</p>;

  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">No one on the waitlist right now.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, idx) => (
        <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
            {idx + 1}
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">Diner</p>
            <p className="text-xs text-muted-foreground">Joined at {fmtTime(entry.created_at)}</p>
          </div>
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-800">
            Waiting
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Requests summary ────────────────────────────────────────────────────────

function RequestsSummary({ venueId }) {
  const { pendingRequests, acceptedRequests, isLoading } = useVenueRequests(venueId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading requests…</p>;

  return (
    <div className="grid grid-cols-2 gap-3 mb-6">
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-3xl font-bold text-foreground">{pendingRequests.length}</p>
        <p className="text-xs text-muted-foreground mt-1">Pending</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-3xl font-bold text-[#22c55e]">{acceptedRequests.length}</p>
        <p className="text-xs text-muted-foreground mt-1">Accepted</p>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function VenuePortal() {
  const { venueId } = useParams();
  const { user, isLoadingAuth } = useAuth();
  const [venue, setVenue] = useState(null);

  useEffect(() => {
    if (!venueId) return;
    supabase
      .from('venues')
      .select('id, name')
      .eq('id', venueId)
      .single()
      .then(({ data }) => setVenue(data));
  }, [venueId]);

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <p className="text-muted-foreground text-sm">Sign in to access the venue portal.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background px-6 py-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Venue Portal</p>
        <h1 className="text-lg font-bold text-foreground">{venue?.name ?? 'Loading…'}</h1>
      </header>

      <div className="max-w-xl mx-auto px-6 py-6">
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Live Requests</h2>
          <RequestsSummary venueId={venueId} />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Waitlist</h2>
          <WaitlistQueue venueId={venueId} />
        </section>
      </div>
    </div>
  );
}
