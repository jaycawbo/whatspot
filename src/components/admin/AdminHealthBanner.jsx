import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useVenueRefreshHealth } from '@/hooks/useVenueRefreshHealth';

// Admin-only (issue #326) — surfaces a growing weekly-refresh stale backlog
// in-app, since Supabase logs don't get checked regularly on a hobby project.
// Rendered as a fixed floating widget (issue #338) rather than an in-flow
// banner, so it never displaces the feed/search layout below the nav.
export default function AdminHealthBanner() {
  const { show, stalePct, dismiss } = useVenueRefreshHealth();
  const [open, setOpen] = useState(false);
  if (!show) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-[60] flex flex-col items-start gap-2">
      {open && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg shadow-lg bg-amber-100 text-amber-900 border border-amber-300 text-sm dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800 max-w-[min(90vw,20rem)]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="flex-1 leading-snug">
            Admin only: {stalePct}% of venues are past their 7-day refresh window — the weekly cron may not be keeping up with venue table growth.
          </span>
          <button
            onClick={dismiss}
            className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className="h-10 w-10 flex items-center justify-center rounded-full shadow-lg bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800 dark:hover:bg-amber-900 transition-colors"
        aria-label={open ? 'Hide admin health notice' : 'Show admin health notice'}
        aria-expanded={open}
      >
        <AlertTriangle className="h-5 w-5" />
      </button>
    </div>
  );
}
