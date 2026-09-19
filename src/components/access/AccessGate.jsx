import React, { useEffect, useState } from 'react';
import WaitlistPage from '@/components/access/WaitlistPage';
import {
  getAccessCode,
  redeemInviteCode,
  revalidateAccess,
  takeInviteParam,
} from '@/lib/accessGate';

// Renders children (the whole app) only when the visitor holds a valid access flag.
// Sits above every provider so visitors never trigger app data calls.
export default function AccessGate({ children }) {
  const [status, setStatus] = useState(() => {
    if (getAccessCode()) return 'granted';
    return 'checking';
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const inviteParam = takeInviteParam();
      if (inviteParam) {
        const ok = await redeemInviteCode(inviteParam);
        if (!cancelled) setStatus(ok ? 'granted' : 'denied');
        return;
      }
      if (getAccessCode()) {
        const stillValid = await revalidateAccess();
        if (!cancelled) setStatus(stillValid ? 'granted' : 'denied');
        return;
      }
      if (!cancelled) setStatus('denied');
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === 'granted') return children;
  if (status === 'checking') return <div className="fixed inset-0 bg-background" />;
  return <WaitlistPage onGranted={() => setStatus('granted')} />;
}
