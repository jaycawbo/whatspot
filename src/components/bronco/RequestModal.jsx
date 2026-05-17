import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { supabase } from '@/integrations/supabase/client';
import { useBronco } from '@/context/BroncoContext';
import { toast } from '@/hooks/use-toast';

const MAX_NOTE = 140;
const MIN_PARTY = 1;
const MAX_PARTY = 20;

export default function RequestModal() {
  const { requestModalVenue, closeRequestModal, openOverlay } = useBronco();
  const [partySize, setPartySize] = useState(2);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const venue = requestModalVenue;
  const open = !!venue;

  // Reset form each time a new venue opens the modal
  useEffect(() => {
    if (open) {
      setPartySize(2);
      setNote('');
    }
  }, [open]);

  const handleOpenChange = (val) => {
    if (!val) closeRequestModal();
  };

  const handleSubmit = async () => {
    if (isSubmitting || !venue) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('create-request', {
        body: {
          venue_id: venue.id,
          party_size: partySize,
          note: note.trim() || null,
        },
      });
      if (error) throw error;
      closeRequestModal();
      openOverlay();
      toast({
        title: 'Request sent!',
        description: `Walk-in request sent to ${(venue.name || '').split('|')[0].trim()}`,
      });
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

  const venueName = venue ? (venue.name || '').split('|')[0].trim() : '';
  const avgResponseMin = venue?.avg_response_sec != null
    ? Math.max(1, Math.round(venue.avg_response_sec / 60))
    : null;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="px-5 pb-10">
        <DrawerHeader className="px-0 pt-5 pb-4">
          <DrawerTitle className="text-base font-semibold text-left">
            Request Walk-In
          </DrawerTitle>
        </DrawerHeader>

        {venue && (
          <div className="flex items-center gap-3 mb-6 pb-5 border-b border-border">
            {venue.image_urls?.[0] && (
              <img
                src={venue.image_urls[0]}
                alt={venueName}
                className="h-12 w-12 rounded-lg object-cover shrink-0"
              />
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
            <span className="w-8 text-center text-xl font-semibold tabular-nums">
              {partySize}
            </span>
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

        <div className="mb-7">
          <p className="text-sm font-medium mb-2">
            Note{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
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

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full rounded-full bg-[#22c55e] py-3.5 text-sm font-semibold text-white hover:bg-[#16a34a] active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {isSubmitting ? 'Sending…' : 'Send Walk-In Request'}
        </button>
      </DrawerContent>
    </Drawer>
  );
}
