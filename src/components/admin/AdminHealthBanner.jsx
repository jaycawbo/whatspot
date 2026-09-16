import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useVenueRefreshHealth } from '@/hooks/useVenueRefreshHealth';

// Admin-only (issue #326) — surfaces a growing weekly-refresh stale backlog
// in-app, since Supabase logs don't get checked regularly on a hobby project.
export default function AdminHealthBanner() {
  const { show, stalePct, dismiss } = useVenueRefreshHealth();
  if (!show) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-100 text-amber-900 border-b border-amber-300 text-sm dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
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
  );
}
