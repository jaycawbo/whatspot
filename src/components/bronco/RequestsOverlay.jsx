import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, ChevronRight, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { useBronco } from '@/context/BroncoContext';
import { useDinerRequests } from '@/hooks/useRequestRealtime';
import { useAuth } from '@/lib/AuthContext';
import { useGlobalState } from '@/context/GlobalStateContext';
import { toast } from '@/hooks/use-toast';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// ── helpers ────────────────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDistance(km) {
  if (km == null) return null;
  return km >= 100 ? `${Math.round(km)} km` : `${parseFloat(km.toFixed(1))} km`;
}

function fmtCountdown(isoDate) {
  if (!isoDate) return null;
  const secs = Math.max(0, Math.round((new Date(isoDate) - Date.now()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  redeemed: 'Arrived',
  cancelled: 'Cancelled',
};

const STATUS_COLORS = {
  pending:   'bg-yellow-100 text-yellow-800',
  accepted:  'bg-green-100 text-green-800',
  declined:  'bg-red-100 text-red-800',
  expired:   'bg-gray-100 text-gray-600',
  redeemed:  'bg-blue-100 text-blue-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

const PAST_STATUSES = ['declined', 'expired', 'redeemed', 'cancelled'];

// ── countdown hook ─────────────────────────────────────────────────────────

function useCountdown(isoDate) {
  const [display, setDisplay] = useState(() => fmtCountdown(isoDate));
  useEffect(() => {
    if (!isoDate) { setDisplay(null); return; }
    setDisplay(fmtCountdown(isoDate));
    const id = setInterval(() => setDisplay(fmtCountdown(isoDate)), 1000);
    return () => clearInterval(id);
  }, [isoDate]);
  return display;
}

// ── sub-components ─────────────────────────────────────────────────────────

function ActiveCard({ request, venue, distanceKm, onCancel }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [onOurWay, setOnOurWay] = useState(false);

  const countdownTarget = request.status === 'pending'
    ? request.expires_at
    : request.holding_expires_at;
  const countdown = useCountdown(countdownTarget);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const { error } = await supabase.functions.invoke('cancel-request', {
        body: { request_id: request.id },
      });
      if (error) throw error;
      onCancel(request.id);
    } catch (err) {
      toast({
        title: 'Could not cancel',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
      {venue?.photo_url && (
        <img
          src={venue.photo_url}
          alt={venue.name}
          className="h-16 w-16 rounded-lg object-cover shrink-0"
        />
      )}
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm leading-tight truncate">
            {venue?.name ?? 'Venue'}
          </p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[request.status]}`}>
            {STATUS_LABELS[request.status]}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {distanceKm != null && <span>{fmtDistance(distanceKm)}</span>}
          {request.party_size && (
            <>
              {distanceKm != null && <span>·</span>}
              <span>Party of {request.party_size}</span>
            </>
          )}
        </div>

        {countdown && (
          <p className="text-xs font-medium text-orange-600">
            {request.status === 'pending' ? 'Expires in' : 'Hold expires in'} {countdown}
          </p>
        )}

        {request.status === 'accepted' && (
          <button
            onClick={() => {
              setOnOurWay(true);
              toast({ title: onOurWay ? 'Already on your way!' : "Great! We'll let the venue know." });
            }}
            disabled={onOurWay}
            className={`mt-1 self-start rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              onOurWay
                ? 'bg-green-100 text-green-700 cursor-default'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {onOurWay ? 'On Our Way' : "On Our Way"}
          </button>
        )}

        {request.status === 'pending' && !confirmCancel && (
          <button
            onClick={() => setConfirmCancel(true)}
            className="mt-1 self-start text-xs text-muted-foreground underline underline-offset-2"
          >
            Cancel
          </button>
        )}

        {confirmCancel && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-foreground">Cancel this request?</span>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded-full bg-destructive px-2.5 py-0.5 text-[11px] font-semibold text-destructive-foreground disabled:opacity-60"
            >
              {cancelling ? 'Cancelling…' : 'Yes'}
            </button>
            <button
              onClick={() => setConfirmCancel(false)}
              className="text-[11px] text-muted-foreground"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PastCard({ request, venue }) {
  const navigate = useNavigate();
  const placeId = venue?.google_place_id;

  return (
    <button
      onClick={() => placeId && navigate(`/venue/${placeId}`)}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
    >
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-sm truncate">{venue?.name ?? 'Venue'}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[request.status]}`}>
            {STATUS_LABELS[request.status]}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{fmtDate(request.created_at)}</span>
          <span>·</span>
          <span>Party of {request.party_size}</span>
          {request.decline_comment && (
            <>
              <span>·</span>
              <span className="truncate italic">&ldquo;{request.decline_comment}&rdquo;</span>
            </>
          )}
        </div>
      </div>
      {placeId && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

// ── main overlay ───────────────────────────────────────────────────────────

export default function RequestsOverlay() {
  const { overlayOpen, closeOverlay } = useBronco();
  const { user } = useAuth();
  const { state } = useGlobalState();
  const userLoc = state?.userLocation;

  const { activeRequests, recentlyExpiredRequests, dismissExpired, isLoading: activeLoading } = useDinerRequests(user?.id ?? null);
  const { isSupported: pushSupported, isSubscribed, isLoading: pushLoading, subscribe, unsubscribe } = usePushNotifications();
  const [pastRequests, setPastRequests] = useState([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [venuesMap, setVenuesMap] = useState({});
  const [tab, setTab] = useState('active');
  const [cancelledIds, setCancelledIds] = useState(new Set());

  // Fetch venue data for a set of venue_ids, merge into venuesMap
  const fetchVenues = useCallback(async (ids) => {
    if (!ids.length) return;
    const missing = ids.filter((id) => !venuesMap[id]);
    if (!missing.length) return;
    const { data } = await supabase
      .from('venues')
      .select('id, name, photo_url, google_place_id, lat, lng')
      .in('id', missing);
    if (data) {
      setVenuesMap((prev) => {
        const next = { ...prev };
        data.forEach((v) => { next[v.id] = v; });
        return next;
      });
    }
  }, [venuesMap]);

  // Fetch venues for active requests when they change
  useEffect(() => {
    const ids = activeRequests.map((r) => r.venue_id);
    if (ids.length) fetchVenues(ids);
  }, [activeRequests, fetchVenues]);

  // Fetch past requests when Past tab is selected
  useEffect(() => {
    if (tab !== 'past' || !user?.id) return;
    setPastLoading(true);
    supabase
      .from('requests')
      .select('*')
      .eq('diner_id', user.id)
      .in('status', PAST_STATUSES)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) {
          setPastRequests(data);
          fetchVenues(data.map((r) => r.venue_id));
        }
      })
      .finally(() => setPastLoading(false));
  }, [tab, user?.id, fetchVenues]);

  // Reset tab to active when overlay opens
  useEffect(() => {
    if (overlayOpen) setTab('active');
  }, [overlayOpen]);

  const handleOpenChange = (val) => { if (!val) closeOverlay(); };

  const handleCancel = (id) => {
    setCancelledIds((prev) => new Set([...prev, id]));
  };

  function distanceFor(venueId) {
    const v = venuesMap[venueId];
    if (!v || !userLoc?.lat || !userLoc?.lon || !v.lat || !v.lng) return null;
    return haversineKm(userLoc.lat, userLoc.lon, v.lat, v.lng);
  }

  const visibleActive = activeRequests.filter((r) => !cancelledIds.has(r.id));

  const handleJoinWaitlist = async (expiredRequest) => {
    try {
      const { error } = await supabase
        .from('waitlist_entries')
        .insert({ diner_id: user.id, venue_id: expiredRequest.venue_id, request_id: expiredRequest.id });
      if (error) throw error;
      dismissExpired(expiredRequest.id);
      toast({ title: 'Added to waitlist', description: "We'll notify you if a spot opens up." });
    } catch (err) {
      toast({ title: 'Could not join waitlist', description: err?.message, variant: 'destructive' });
    }
  };

  return (
    <Drawer open={overlayOpen} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[85dvh] flex flex-col">
        <DrawerHeader className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <DrawerTitle className="text-base font-semibold">Your Requests</DrawerTitle>
          <div className="flex items-center gap-2">
            {pushSupported && (
              <button
                onClick={isSubscribed ? unsubscribe : subscribe}
                disabled={pushLoading}
                title={isSubscribed ? 'Disable notifications' : 'Enable notifications'}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {isSubscribed ? <Bell className="h-4 w-4 text-green-500" /> : <BellOff className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={closeOverlay}
              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DrawerHeader>

        {/* Tab bar */}
        <div className="flex gap-1 mx-5 mb-4 rounded-lg bg-muted p-1 shrink-0">
          {['active', 'past'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors capitalize ${
                tab === t
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {t === 'active' ? `Active${visibleActive.length ? ` (${visibleActive.length})` : ''}` : 'Past'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {tab === 'active' && (
            <>
              {activeLoading && (
                <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
              )}

              {/* Recently-expired waitlist prompts */}
              {recentlyExpiredRequests.map((r) => {
                const venue = venuesMap[r.venue_id];
                return (
                  <div key={r.id} className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 mb-1">
                    {venue?.photo_url && (
                      <img src={venue.photo_url} alt={venue?.name} className="h-10 w-10 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{venue?.name ?? 'Venue'}</p>
                      <p className="text-xs text-muted-foreground">Request expired — join their waitlist?</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => handleJoinWaitlist(r)}
                        className="rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-600"
                      >
                        Join
                      </button>
                      <button
                        onClick={() => dismissExpired(r.id)}
                        className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/80"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}

              {!activeLoading && visibleActive.length === 0 && recentlyExpiredRequests.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No active requests right now.
                </p>
              )}
              <div className="flex flex-col gap-3">
                {visibleActive.map((r) => (
                  <ActiveCard
                    key={r.id}
                    request={r}
                    venue={venuesMap[r.venue_id] ?? null}
                    distanceKm={distanceFor(r.venue_id)}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            </>
          )}

          {tab === 'past' && (
            <>
              {pastLoading && (
                <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
              )}
              {!pastLoading && pastRequests.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No past requests yet.
                </p>
              )}
              <div className="flex flex-col gap-3">
                {pastRequests.map((r) => (
                  <PastCard
                    key={r.id}
                    request={r}
                    venue={venuesMap[r.venue_id] ?? null}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
