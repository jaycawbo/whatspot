import React, { useEffect, useRef, useState } from 'react';
import { useDinerRequests } from '@/hooks/useRequestRealtime';
import { useBronco } from '@/context/BroncoContext';
import { useAuth } from '@/lib/AuthContext';

// Minimum bottom offset so the pill is never behind the nav bar.
const PILL_MARGIN = 16;
const PILL_MIN_BOTTOM = 72;

export default function FloatingRequestsPill() {
  const { user } = useAuth();
  const { activeRequests } = useDinerRequests(user?.id ?? null);
  const { openOverlay, isTrayDragging, traySnapHeightPx } = useBronco();
  const [pulsing, setPulsing] = useState(false);

  // Track previous status fingerprint to detect changes
  const prevFingerprintRef = useRef('');

  useEffect(() => {
    const fingerprint = activeRequests.map((r) => `${r.id}:${r.status}`).join(',');
    if (prevFingerprintRef.current && fingerprint !== prevFingerprintRef.current) {
      setPulsing(true);
      const t = setTimeout(() => setPulsing(false), 700);
      return () => clearTimeout(t);
    }
    prevFingerprintRef.current = fingerprint;
  }, [activeRequests]);

  if (!user || activeRequests.length === 0) return null;

  const count = activeRequests.length;
  const bottomPx = Math.max(PILL_MIN_BOTTOM, traySnapHeightPx + PILL_MARGIN);

  return (
    <button
      onClick={openOverlay}
      aria-label={`${count} active walk-in request${count !== 1 ? 's' : ''}`}
      style={{
        position: 'fixed',
        right: '16px',
        bottom: `${bottomPx}px`,
        zIndex: 40,
        pointerEvents: isTrayDragging ? 'none' : 'auto',
        transition: 'bottom 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      className="relative flex items-center gap-2 rounded-full bg-[#22c55e] px-4 py-2.5 shadow-lg"
    >
      {/* Pulse ring on status change */}
      {pulsing && (
        <span className="absolute inset-0 rounded-full bg-[#22c55e] animate-ping opacity-60" />
      )}

      <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#16a34a] tabular-nums">
        {count > 9 ? '9+' : count}
      </span>
      <span className="relative text-xs font-semibold text-white leading-none">
        Walk-In{count !== 1 ? 's' : ''}
      </span>
    </button>
  );
}
