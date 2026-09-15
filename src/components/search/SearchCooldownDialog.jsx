import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Clock } from 'lucide-react';

function formatCountdown(msRemaining) {
  if (msRemaining <= 0) return '0:00:00';
  const totalSeconds = Math.ceil(msRemaining / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Shown once a signed-in user has spent all 5 searches in their bucket (each
// slot refills independently 4.8h after it was used — see _shared/searchQuota.ts,
// issue #319). Ticks down live to nextAllowedAt rather than showing a flat
// "come back tomorrow" message.
export default function SearchCooldownDialog({ open, onOpenChange, nextAllowedAt }) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!open || !nextAllowedAt) return;

    const tick = () => {
      setRemainingMs(Math.max(0, new Date(nextAllowedAt).getTime() - Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open, nextAllowedAt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-xl">You're out of searches for now</DialogTitle>
          <DialogDescription>
            Accounts get 5 searches, each refilling on its own 4.8 hours after it was used.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 text-center">
          <div className="font-mono text-3xl tabular-nums tracking-tight text-foreground">
            {formatCountdown(remainingMs)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">until your next search</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
