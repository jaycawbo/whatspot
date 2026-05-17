import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function generateSecret(byteLen = 32) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function useVenueRequests(venueId) {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [acceptedRequests, setAcceptedRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('requests')
        .select('id, status, party_size, created_at, deposit_status, deposit_amount_cents')
        .eq('venue_id', venueId)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: true });
      if (!cancelled) {
        const rows = data ?? [];
        setPendingRequests(rows.filter((r) => r.status === 'pending'));
        setAcceptedRequests(rows.filter((r) => r.status === 'accepted'));
        setIsLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel(`venue-requests-${venueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requests', filter: `venue_id=eq.${venueId}` },
        () => { load(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [venueId]);

  return { pendingRequests, acceptedRequests, isLoading };
}

// ── Requests summary ──────────────────────────────────────────────────────────

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

// ── Waitlist queue ────────────────────────────────────────────────────────────

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
        () => { load(); },
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

// ── POS Integrations ──────────────────────────────────────────────────────────

const PROVIDERS = [
  { id: 'toast',      label: 'Toast',      description: 'Toast POS floor management' },
  { id: 'lightspeed', label: 'Lightspeed', description: 'Lightspeed Restaurant' },
  { id: 'square',     label: 'Square',     description: 'Square for Restaurants' },
];

function IntegrationsSection({ venueId }) {
  const [integrations, setIntegrations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adding, setAdding] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const webhookBase = `${supabaseUrl}/functions/v1/pos-webhook-handler`;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('venue_integrations')
      .select('id, provider, is_active')
      .eq('venue_id', venueId);
    setIntegrations(data ?? []);
    setIsLoading(false);
  }, [venueId]);

  useEffect(() => { load(); }, [load]);

  const getIntegration = (providerId) => integrations.find((i) => i.provider === providerId) ?? null;

  function handleConnect(providerId) {
    setAdding({ provider: providerId, secret: generateSecret() });
  }

  async function handleSave() {
    if (!adding) return;
    setSaving(true);
    await supabase.from('venue_integrations').upsert(
      { venue_id: venueId, provider: adding.provider, webhook_secret: adding.secret, settings: {}, is_active: true },
      { onConflict: 'venue_id,provider' },
    );
    setSaving(false);
    setAdding(null);
    load();
  }

  async function handleRemove(integrationId) {
    await supabase.from('venue_integrations').delete().eq('id', integrationId);
    load();
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading integrations…</p>;

  return (
    <div className="flex flex-col gap-4">
      {PROVIDERS.map((p) => {
        const existing = getIntegration(p.id);
        const isAdding = adding?.provider === p.id;
        const webhookUrl = `${webhookBase}?venueId=${venueId}&provider=${p.id}`;

        return (
          <div key={p.id} className="rounded-xl border border-border bg-card px-4 py-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>

              {existing ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
                    Connected
                  </span>
                  <button
                    onClick={() => handleRemove(existing.id)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : !isAdding ? (
                <button
                  onClick={() => handleConnect(p.id)}
                  className="text-xs font-medium border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
                >
                  Connect
                </button>
              ) : null}
            </div>

            {existing && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground font-medium mb-1">Webhook URL</p>
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <code className="text-[10px] flex-1 break-all text-foreground">{webhookUrl}</code>
                  <button
                    onClick={() => copy(webhookUrl, `url-${p.id}`)}
                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground shrink-0"
                  >
                    {copied === `url-${p.id}` ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {isAdding && (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Webhook URL</p>
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                    <code className="text-[10px] flex-1 break-all text-foreground">{webhookUrl}</code>
                    <button
                      onClick={() => copy(webhookUrl, `url-${p.id}`)}
                      className="text-[10px] font-medium text-muted-foreground hover:text-foreground shrink-0"
                    >
                      {copied === `url-${p.id}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Webhook Secret</p>
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                    <code className="text-[10px] flex-1 break-all font-mono text-foreground">{adding.secret}</code>
                    <button
                      onClick={() => copy(adding.secret, `secret-${p.id}`)}
                      className="text-[10px] font-medium text-muted-foreground hover:text-foreground shrink-0"
                    >
                      {copied === `secret-${p.id}` ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Copy this into {p.label} before saving — it won't be shown again.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 text-xs font-medium text-background bg-foreground rounded-lg py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Integration'}
                  </button>
                  <button
                    onClick={() => setAdding(null)}
                    className="text-xs font-medium text-muted-foreground border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[10px] text-muted-foreground">
        POS integrations update walk-in availability from floor state. Manual availability changes override POS data for 5 minutes.
      </p>
    </div>
  );
}

// ── Deposit / Billing ─────────────────────────────────────────────────────────

function DepositSection({ venueId }) {
  const [depositCents, setDepositCents] = useState(null);
  const [inputDollars, setInputDollars] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    supabase
      .from('walkin_venues')
      .select('deposit_amount_cents')
      .eq('id', venueId)
      .single()
      .then(({ data }) => {
        if (data) {
          setDepositCents(data.deposit_amount_cents);
          setInputDollars(data.deposit_amount_cents > 0 ? (data.deposit_amount_cents / 100).toFixed(2) : '');
        }
      });
  }, [venueId]);

  const handleSave = async () => {
    const dollars = parseFloat(inputDollars);
    const cents = isNaN(dollars) || dollars < 0 ? 0 : Math.round(dollars * 100);
    setSaving(true);
    const { error } = await supabase
      .from('walkin_venues')
      .update({ deposit_amount_cents: cents })
      .eq('id', venueId);
    setSaving(false);
    if (!error) {
      setDepositCents(cents);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const isDirty = depositCents !== null &&
    Math.round((parseFloat(inputDollars) || 0) * 100) !== depositCents;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card px-4 py-4">
        <p className="text-sm font-semibold text-foreground mb-1">Deposit amount</p>
        <p className="text-xs text-muted-foreground mb-3">
          Set to $0 to disable deposits. When set, diners must authorize this amount before their
          request is sent. Charged on acceptance, refunded on arrival, forfeited on no-show.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-border bg-background px-3 py-2 gap-1.5">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={inputDollars}
              onChange={(e) => { setInputDollars(e.target.value); setSaved(false); }}
              placeholder="0.00"
              className="w-20 text-sm bg-transparent focus:outline-none tabular-nums"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="text-xs font-medium text-background bg-foreground rounded-lg px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {depositCents !== null && depositCents > 0 && (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Stripe handles payment collection. Wire up{' '}
            <code className="font-mono">STRIPE_SECRET_KEY</code> and{' '}
            <code className="font-mono">STRIPE_WEBHOOK_SECRET</code> in Supabase Edge Function secrets to activate.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function VenuePortal() {
  const { venueId } = useParams();
  const { user, isLoadingAuth } = useAuth();
  const [venue, setVenue] = useState(null);

  useEffect(() => {
    if (!venueId) return;
    supabase
      .from('walkin_venues')
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

        <section className="mb-8">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Deposit / Billing</h2>
          <DepositSection venueId={venueId} />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">POS Integrations</h2>
          <IntegrationsSection venueId={venueId} />
        </section>
      </div>
    </div>
  );
}
