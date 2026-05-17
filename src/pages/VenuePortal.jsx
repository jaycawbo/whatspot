import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useVenueRequests } from '@/hooks/useRequestRealtime';
import { useAuth } from '@/lib/AuthContext';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';

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

// ── Analytics ─────────────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function AnalyticsSection({ venueId }) {
  const [stats, setStats] = useState(null);
  const [hourlyData, setHourlyData] = useState([]);
  const [dailyData, setDailyData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      const [{ data: statsRow }, { data: recentRequests }] = await Promise.all([
        supabase
          .from('venue_analytics')
          .select('total_requests, acceptance_rate_pct, redemption_rate_pct, avg_response_sec')
          .eq('venue_id', venueId)
          .single(),
        supabase
          .from('requests')
          .select('created_at')
          .eq('venue_id', venueId)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      if (cancelled) return;

      setStats(statsRow);

      if (recentRequests) {
        // Hourly distribution (hour-of-day buckets, all time within last 7 days)
        const hourCounts = Array.from({ length: 24 }, (_, h) => ({
          hour: `${h}:00`,
          count: 0,
        }));
        recentRequests.forEach(r => {
          hourCounts[new Date(r.created_at).getHours()].count++;
        });
        setHourlyData(hourCounts);

        // 7-day daily trend
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
          return {
            date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            dateKey: d.toISOString().slice(0, 10),
            count: 0,
          };
        });
        recentRequests.forEach(r => {
          const key = r.created_at.slice(0, 10);
          const day = days.find(d => d.dateKey === key);
          if (day) day.count++;
        });
        setDailyData(days);
      }

      setIsLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [venueId]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading analytics…</p>;
  if (!stats) return <p className="text-sm text-muted-foreground">No analytics data yet.</p>;

  const avgMin = stats.avg_response_sec ? Math.max(1, Math.round(stats.avg_response_sec / 60)) : null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Total Requests" value={stats.total_requests ?? 0} />
        <StatCard
          label="Acceptance Rate"
          value={stats.acceptance_rate_pct != null ? `${stats.acceptance_rate_pct}%` : '—'}
        />
        <StatCard
          label="Redemption Rate"
          value={stats.redemption_rate_pct != null ? `${stats.redemption_rate_pct}%` : '—'}
        />
        <StatCard label="Avg Response" value={avgMin != null ? `~${avgMin}m` : '—'} />
      </div>

      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Requests — Last 7 Days
      </h3>
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={dailyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Requests by Hour of Day
      </h3>
      <div className="rounded-xl border border-border bg-card p-4">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={hourlyData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 9 }}
              tickFormatter={h => (parseInt(h) % 6 === 0 ? h : '')}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Bar dataKey="count" fill="#6366f1" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
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

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Waitlist</h2>
          <WaitlistQueue venueId={venueId} />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Analytics</h2>
          <AnalyticsSection venueId={venueId} />
        </section>
      </div>
    </div>
  );
}
