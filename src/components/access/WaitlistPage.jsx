import React, { useState } from 'react';
import WhatspotLogo from '@/components/brand/WhatspotLogo';
import { enterWithCode, getReferralSource, joinWaitlist, signInWithGoogle } from '@/lib/accessGate';

export default function WaitlistPage({ userEmail, notice, onGranted, onTaken, onSignOut }) {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [signInError, setSignInError] = useState(null);

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
    setCodeError(null);
    const result = await enterWithCode(code);
    setCodeBusy(false);
    if (result === 'ok') onGranted();
    else if (result === 'taken') onTaken();
    else setCodeError('That code was not recognized.');
  };

  const handleSignIn = async () => {
    setSignInError(null);
    const err = await signInWithGoogle();
    if (err) setSignInError(err);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <WhatspotLogo size="hero" />
        <h1 className="mt-8 text-2xl font-semibold">Discover, organize and share the spots you love.</h1>
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

        {notice === 'taken' && (
          <p className="mt-8 w-full rounded-lg border border-border px-4 py-3 text-sm text-destructive">
            That invite code is already linked to a different account.
          </p>
        )}

        <div className="mt-12 w-full flex flex-col items-center gap-2">
          {userEmail ? (
            <>
              <p className="text-sm text-muted-foreground">
                Signed in as {userEmail}. This account has no invite yet. Enter a code below to link it.
              </p>
              <button type="button" onClick={onSignOut} className="text-sm text-muted-foreground underline">
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSignIn}
                className="w-full rounded-lg border border-border px-4 py-3 font-medium"
              >
                Sign in with Google
              </button>
              {signInError && <p className="text-sm text-destructive">{signInError}</p>}
            </>
          )}
        </div>

        <div className="mt-6 w-full">
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
              {codeError && <p className="text-sm text-destructive">{codeError}</p>}
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowCode(true)}
              className="text-base text-muted-foreground underline"
            >
              Have an invite code?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
