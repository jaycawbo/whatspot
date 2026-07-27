import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { useBronco } from '@/context/BroncoContext';
import { toast } from '@/hooks/use-toast';
import { logEvent, venueSnapshot } from '@/lib/logEvent';

const MAX_NOTE = 140;
const MIN_PARTY = 1;
const MAX_PARTY = 20;

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null;

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '14px',
      color: '#09090b',
      fontFamily: 'inherit',
      '::placeholder': { color: '#71717a' },
    },
    invalid: { color: '#ef4444' },
  },
};

// Inner form — needs to be inside <Elements> when deposit is required
function RequestForm({ venue, onClose, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();

  const [partySize, setPartySize] = useState(2);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [imgReady, setImgReady] = useState(false);

  const depositCents = venue?.deposit_amount_cents ?? 0;
  const requiresDeposit = depositCents > 0;
  const depositDisplay = requiresDeposit
    ? `$${(depositCents / 100).toFixed(2)}`
    : null;

  const venueName = venue ? (venue.name || '').split('|')[0].trim() : '';
  const avgResponseMin = venue?.avg_response_sec != null
    ? Math.max(1, Math.round(venue.avg_response_sec / 60))
    : null;

  useEffect(() => {
    setPartySize(2);
    setNote('');
    setPaymentError(null);
    setImgReady(false);
  }, [venue?.id]);

  const handleSubmit = async () => {
    if (isSubmitting || !venue) return;
    setIsSubmitting(true);
    setPaymentError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-request', {
        body: { venue_id: venue.id, party_size: partySize, note: note.trim() || null },
      });

      if (fnError) throw fnError;

      const { client_secret } = data;

      if (client_secret) {
        if (!stripe || !elements) throw new Error('Payment not ready. Please try again.');

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) throw new Error('Card element not found.');

        const { error: stripeError } = await stripe.confirmCardPayment(client_secret, {
          payment_method: { card: cardElement },
        });

        if (stripeError) {
          setPaymentError(stripeError.message ?? 'Payment authorization failed.');
          setIsSubmitting(false);
          return;
        }
      }

      logEvent('walk_in_request', {
        venue_id: venue.place_id || venue.google_place_id || venue.id,
        metadata: { party_size: partySize },
        ...venueSnapshot(venue),
      });

      onClose();
      onSuccess(venueName);
    } catch (err) {
      const msg = err?.message || 'Could not send request. Please try again.';
      toast({
        title: 'Request failed',
        description: msg.includes('401') || msg.includes('Unauthenticated')
          ? 'Please sign in to request a walk-in.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {venue && (
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-border">
          {(venue.image_urls?.[0] || venue.photo_urls?.[0]) && (
            <div className="relative shrink-0">
              <img
                src={venue.image_urls?.[0] || venue.photo_urls?.[0]}
                alt={venueName}
                className="h-12 w-12 rounded-lg object-cover"
                onLoad={() => setImgReady(true)}
                onError={() => setImgReady(true)}
              />
              {!imgReady && (
                <>
                  <div className="absolute inset-0 rounded-lg animate-pulse bg-muted-foreground/25" />
                  <div className="absolute inset-0 rounded-lg shimmer-sweep" />
                </>
              )}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{venueName}</p>
            {avgResponseMin !== null && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Usually responds in ~{avgResponseMin} min
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mb-6">
        <p className="text-sm font-medium mb-3">Party size</p>
        <div className="flex items-center gap-5">
          <button
            onClick={() => setPartySize((n) => Math.max(MIN_PARTY, n - 1))}
            disabled={partySize <= MIN_PARTY}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground disabled:opacity-30 active:scale-95 transition-transform"
            aria-label="Decrease party size"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-xl font-semibold tabular-nums">{partySize}</span>
          <button
            onClick={() => setPartySize((n) => Math.min(MAX_PARTY, n + 1))}
            disabled={partySize >= MAX_PARTY}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground disabled:opacity-30 active:scale-95 transition-transform"
            aria-label="Increase party size"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-sm font-medium mb-2">
          Note <span className="font-normal text-muted-foreground">(optional)</span>
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
          placeholder="Any requests? e.g. window seat, celebrating a birthday"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          rows={3}
        />
        <p className="text-right text-[11px] text-muted-foreground mt-1">
          {note.length}/{MAX_NOTE}
        </p>
      </div>

      {requiresDeposit && (
        <div className="mb-6">
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 mb-4">
            <p className="text-sm font-medium text-foreground">
              Deposit required: {depositDisplay}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Charged when the venue accepts. Refunded when you arrive.
            </p>
          </div>

          {stripePromise ? (
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Card details</p>
              <CardElement options={CARD_ELEMENT_OPTIONS} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground rounded-xl border border-border px-4 py-3">
              Stripe is not yet configured. Wire up{' '}
              <code className="font-mono">VITE_STRIPE_PUBLISHABLE_KEY</code> to enable payment.
            </p>
          )}

          {paymentError && (
            <p className="text-xs text-destructive mt-2">{paymentError}</p>
          )}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || (requiresDeposit && !stripePromise)}
        className="w-full rounded-full bg-[#22c55e] py-3.5 text-sm font-semibold text-white hover:bg-[#16a34a] active:scale-[0.98] transition-all disabled:opacity-60"
      >
        {isSubmitting ? 'Sending…' : 'Send Walk-In Request'}
      </button>
    </>
  );
}

export default function RequestModal() {
  const { requestModalVenue, closeRequestModal, openOverlay } = useBronco();

  const venue = requestModalVenue;
  const open = !!venue;

  const handleOpenChange = (val) => {
    if (!val) closeRequestModal();
  };

  const handleSuccess = (venueName) => {
    openOverlay();
    toast({
      title: 'Request sent!',
      description: `Walk-in request sent to ${venueName}`,
    });
  };

  const requiresDeposit = (venue?.deposit_amount_cents ?? 0) > 0;

  const form = (
    <RequestForm
      venue={venue}
      onClose={closeRequestModal}
      onSuccess={handleSuccess}
    />
  );

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="px-5 pb-10">
        <DrawerHeader className="px-0 pt-5 pb-4">
          <DrawerTitle className="text-base font-semibold text-left">
            Request Walk-In
          </DrawerTitle>
        </DrawerHeader>

        {venue && (
          requiresDeposit && stripePromise ? (
            <Elements stripe={stripePromise}>{form}</Elements>
          ) : (
            form
          )
        )}
      </DrawerContent>
    </Drawer>
  );
}
