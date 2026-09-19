import React, { useEffect, useState } from 'react';
import WaitlistPage from '@/components/access/WaitlistPage';
import {
  enterWithCode,
  getAccessCode,
  getSessionUser,
  onSignedIn,
  restoreAccessFromAccount,
  revalidateAccess,
  signOutUser,
  syncClaim,
  takeInviteParam,
} from '@/lib/accessGate';

// Renders children (the whole app) only when the visitor holds a valid access flag.
// Sits above every provider so visitors never trigger app data calls.
//
// Access comes from: a valid invite code (?invite= or typed), or a signed-in account
// that is linked to an invite code or is an admin.
export default function AccessGate({ children }) {
  const [status, setStatus] = useState(() => (getAccessCode() ? 'granted' : 'checking'));
  const [notice, setNotice] = useState(null);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const reconcile = async () => {
      const user = await getSessionUser();
      if (cancelled) return;
      setUserEmail(user?.email ?? null);

      const inviteParam = takeInviteParam();
      if (inviteParam) {
        const result = await enterWithCode(inviteParam);
        if (cancelled) return;
        setNotice(result === 'taken' ? 'taken' : null);
        setStatus(result === 'ok' ? 'granted' : 'denied');
        return;
      }

      if (getAccessCode()) {
        const valid = await revalidateAccess();
        if (cancelled) return;
        if (valid && !(await syncClaim())) {
          if (!cancelled) { setNotice('taken'); setStatus('denied'); }
          return;
        }
        if (!cancelled) setStatus(valid ? 'granted' : 'denied');
        return;
      }

      const restored = await restoreAccessFromAccount();
      if (!cancelled) setStatus(restored ? 'granted' : 'denied');
    };

    reconcile();
    // OAuth returns to the page with a fresh session: link the code / restore access.
    const stopListening = onSignedIn(reconcile);
    return () => { cancelled = true; stopListening(); };
  }, []);

  if (status === 'granted') return children;
  if (status === 'checking') return <div className="fixed inset-0 bg-background" />;
  return (
    <WaitlistPage
      userEmail={userEmail}
      notice={notice}
      onGranted={() => { setNotice(null); setStatus('granted'); }}
      onTaken={() => setNotice('taken')}
      onSignOut={async () => { await signOutUser(); setUserEmail(null); setNotice(null); }}
    />
  );
}
