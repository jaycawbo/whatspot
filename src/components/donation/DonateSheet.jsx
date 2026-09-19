import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const PRESET_AMOUNTS = [300, 500, 1000, 2500];

function AmountChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-muted-foreground hover:bg-accent'
      )}
    >
      {children}
    </button>
  );
}

export default function DonateSheet({ open, onOpenChange }) {
  const [selectedAmount, setSelectedAmount] = useState(PRESET_AMOUNTS[1]);
  const [customAmount, setCustomAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedAmount(PRESET_AMOUNTS[1]);
      setCustomAmount('');
    }
  }, [open]);

  const amountCents = customAmount.trim() !== ''
    ? Math.round(parseFloat(customAmount) * 100)
    : selectedAmount;

  const canSubmit = !submitting && Number.isInteger(amountCents) && amountCents >= 100 && amountCents <= 100000;

  const handleDonate = async () => {
    setSubmitting(true);
    try {
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.delete('donated');
      const cancelUrl = returnUrl.toString();
      returnUrl.searchParams.set('donated', '1');
      const successUrl = returnUrl.toString();

      const { data, error } = await supabase.functions.invoke('create-donation-checkout', {
        body: { amount_cents: amountCents, success_url: successUrl, cancel_url: cancelUrl },
      });
      if (error) throw new Error(error.message);
      if (!data?.url) throw new Error('No checkout URL returned');

      window.location.href = data.url;
    } catch (err) {
      toast(err.message ?? 'Could not start checkout');
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-8">
        <SheetHeader>
          <SheetTitle>Support WhatSpot</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Enjoying the app? A one-time donation helps keep it running.
          </p>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESET_AMOUNTS.map((cents) => (
              <AmountChip
                key={cents}
                active={customAmount.trim() === '' && selectedAmount === cents}
                onClick={() => { setSelectedAmount(cents); setCustomAmount(''); }}
              >
                ${(cents / 100).toFixed(0)}
              </AmountChip>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              type="number"
              min="1"
              max="1000"
              step="1"
              placeholder="Custom amount"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
            />
          </div>

          <Button className="w-full" disabled={!canSubmit} onClick={handleDonate}>
            {submitting ? 'Redirecting…' : `Donate $${(amountCents / 100 || 0).toFixed(2)}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
