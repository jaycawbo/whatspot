import React, { useEffect, useRef, useState } from 'react';
import WhatspotLogo from '@/components/brand/WhatspotLogo';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import samplePhoto from '@/assets/sample_venue_photo.jpg';
import {
  consumeOAuthPendingFlag,
  enterWithCode,
  getReferralSource,
  joinWaitlist,
  signInWithGoogle,
} from '@/lib/accessGate';

// Purely decorative stand-in for the real Feed: one made-up venue over a static local
// image, no hooks or network calls of any kind. The real DiscoveryDeck/useDiscoveryFeed
// fetch live data through paid APIs and must never mount for a visitor who hasn't passed
// the gate. Photo: "The Courtyard Coffee Shop interior, Ballycastle" via Wikimedia
// Commons / geograph.org.uk, CC BY-SA 2.0 (https://geograph.org.uk/photo/8123928).
const SAMPLE_CARD = {
  name: 'Corner Coffee Roasters',
  tag: 'Coffee · Independent',
  blurb: 'Neighborhood espresso bar, always busy on weekends.',
};

const NAV_ITEMS = ['Feed', 'Search', 'Spots'];

function FeedPreview() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 overflow-hidden bg-muted/30 px-6">
      <WhatspotLogo size="nav" />
      <div className="w-[260px] overflow-hidden rounded-2xl border border-border bg-background text-left shadow-lg sm:w-[300px]">
        <img
          src={samplePhoto}
          alt=""
          className="h-64 w-full object-cover sm:h-72"
        />
        <div className="p-4">
          <p className="font-semibold">{SAMPLE_CARD.name}</p>
          <p className="text-xs text-muted-foreground">{SAMPLE_CARD.tag}</p>
          <p className="mt-1 text-sm text-muted-foreground">{SAMPLE_CARD.blurb}</p>
        </div>
      </div>
      <div className="flex gap-8 text-sm text-muted-foreground">
        {NAV_ITEMS.map((item) => <span key={item}>{item}</span>)}
      </div>
      <p className="absolute bottom-2 text-[10px] text-muted-foreground/60">
        Photo: geograph.org.uk, CC BY-SA 2.0
      </p>
    </div>
  );
}

export default function WaitlistPage({ userEmail, notice, onGranted, onTaken, onSignOut }) {
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [accessOpen, setAccessOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [signInError, setSignInError] = useState(null);
  const hasOpenedRef = useRef(false);

  const openAccess = () => {
    hasOpenedRef.current = true;
    setAccessOpen(true);
  };

  // Reveal the access dialog on whichever comes first: the visitor interacting with the
  // preview, or a short delay. Either way it is not shown on first paint, so a crawl that
  // reads the initial render (Google's OAuth branding check included) sees the preview,
  // not a sign-in wall.
  useEffect(() => {
    const timer = setTimeout(() => { if (!hasOpenedRef.current) openAccess(); }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Genuine "you still need to finish something" moments still open it immediately:
  // right after a Google OAuth redirect back to this tab, or a code claimed elsewhere.
  useEffect(() => {
    if (notice === 'taken') { openAccess(); return; }
    if (userEmail && consumeOAuthPendingFlag()) openAccess();
  }, [userEmail, notice]);

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
    <div className="relative min-h-screen bg-background text-foreground">
      <FeedPreview />

      {!accessOpen && (
        <button
          type="button"
          onClick={openAccess}
          aria-label="Continue to whatspot"
          className="absolute inset-0 h-full w-full cursor-pointer bg-transparent"
        />
      )}

      <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
        <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
          <DialogHeader className="items-center text-center">
            <WhatspotLogo size="hero" />
            <DialogTitle className="mt-2">Discover, organize and share the spots you love.</DialogTitle>
          </DialogHeader>

          <p className="text-center text-sm text-muted-foreground">
            whatspot is in a closed test. Join the waitlist and we will let you know when it opens up.
          </p>

          {state === 'done' ? (
            <p className="rounded-lg border border-border px-4 py-3 text-center text-sm">You are on the list. Thank you!</p>
          ) : (
            <form onSubmit={submitEmail} className="flex flex-col gap-3">
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

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            already have access
            <div className="h-px flex-1 bg-border" />
          </div>

          {notice === 'taken' && (
            <p className="rounded-lg border border-border px-4 py-3 text-sm text-destructive">
              That invite code is already linked to a different account.
            </p>
          )}

          {userEmail ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-muted-foreground">
                Signed in as {userEmail}. This account has no invite yet. Enter a code below to link it.
              </p>
              <button type="button" onClick={onSignOut} className="text-sm text-muted-foreground underline">
                Sign out
              </button>
            </div>
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

          <p className="text-center text-xs text-muted-foreground">
            <a className="underline" href="/privacy">Privacy Policy</a>
            <span className="px-2">·</span>
            <a className="underline" href="/terms">Terms of Service</a>
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
