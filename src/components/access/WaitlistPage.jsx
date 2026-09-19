import React, { useState } from 'react';
import WhatspotLogo from '@/components/brand/WhatspotLogo';
import { getReferralSource, joinWaitlist, redeemInviteCode } from '@/lib/accessGate';

const PILLARS = [
  { title: 'Discover', body: "Swipe through places you didn't know about, locally or abroad." },
  { title: 'Organize', body: "Keep everywhere you've been and want to go in one place." },
  { title: 'Share', body: 'See where friends have been and tell them where to go next.' },
];

export default function WaitlistPage({ onGranted }) {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);

  const submitEmail = async (e) => {
    e.preventDefault();
    if (honeypot) { setState('done'); return; }
    setState('sending');
    const ok = await joinWaitlist(email, getReferralSource());
    setState(ok ? 'done' : 'error');
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setCodeBusy(true);
    setCodeError(false);
    const ok = await redeemInviteCode(code);
    setCodeBusy(false);
    if (ok) onGranted();
    else setCodeError(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <WhatspotLogo size="hero" />
        <h1 className="mt-8 text-3xl font-semibold">Discover, organize and share the places you love.</h1>
        <p className="mt-3 text-muted-foreground">
          whatspot is in a closed test. Join the waitlist and we will let you know when it opens up.
        </p>

        {state === 'done' ? (
          <p className="mt-8 rounded-lg border border-border px-4 py-3">You are on the list. Thank you!</p>
        ) : (
          <form onSubmit={submitEmail} className="mt-8 w-full flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-base"
            />
            {/* Honeypot: hidden from people, filled by bots */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              aria-hidden="true"
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
            />
            <button
              type="submit"
              disabled={state === 'sending'}
              className="w-full rounded-lg bg-foreground px-4 py-3 text-background font-medium disabled:opacity-60"
            >
              {state === 'sending' ? 'Joining...' : 'Join the waitlist'}
            </button>
            {state === 'error' && (
              <p className="text-sm text-destructive">That did not work. Check the email and try again.</p>
            )}
          </form>
        )}

        <ul className="mt-12 w-full flex flex-col gap-4 text-left">
          {PILLARS.map((p) => (
            <li key={p.title} className="rounded-lg border border-border px-4 py-3">
              <p className="font-medium">{p.title}</p>
              <p className="text-sm text-muted-foreground">{p.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-12 w-full">
          {showCode ? (
            <form onSubmit={submitCode} className="flex flex-col gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Invite code"
                aria-label="Invite code"
                autoCapitalize="off"
                autoCorrect="off"
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-base"
              />
              <button
                type="submit"
                disabled={codeBusy || !code.trim()}
                className="w-full rounded-lg border border-border px-4 py-3 font-medium disabled:opacity-60"
              >
                {codeBusy ? 'Checking...' : 'Enter'}
              </button>
              {codeError && <p className="text-sm text-destructive">That code was not recognized.</p>}
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowCode(true)}
              className="text-sm text-muted-foreground underline"
            >
              Have an invite code?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
