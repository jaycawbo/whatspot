import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, List, MapPin, Search, SlidersHorizontal, Star } from 'lucide-react';
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

// Purely decorative stand-in for the real homescreen: same header / search-row / feed-tabs
// / card layout and class names as Header.jsx, SearchRow.jsx, FeedModeTabs.jsx and
// DiscoveryCard.jsx, copied by hand rather than imported, with one made-up venue and no
// hooks, providers or network calls of any kind. The real components depend on
// GlobalStateContext/AuthContext/QueryClient (mounted below AccessGate) and
// DiscoveryDeck/useDiscoveryFeed fetch live data through paid APIs — none of that may
// mount for a visitor who hasn't passed the gate, so this reimplements the look only.
// Photo: "The Courtyard Coffee Shop interior, Ballycastle" via Wikimedia Commons /
// geograph.org.uk, CC BY-SA 2.0 (https://geograph.org.uk/photo/8123928).
const SAMPLE_VENUE = {
  name: 'Corner Coffee Roasters',
  rating: 4.6,
  price: '$$',
  distanceKm: 0.4,
  descriptors: ['cozy neighbourhood gem', 'specialty coffee', 'perfect pastries'],
};

const FEED_TABS = ['Walk-In Friendly', 'New', 'Trending', 'Popular', 'For You'];
const ACTIVE_TAB = 'Trending';

function FeedPreview() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-background" style={{ height: '100dvh' }}>
      {/* Header — mirrors Header.jsx */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-background border-b border-border flex items-center px-4 md:px-8">
        <div className="flex items-center min-w-0 flex-1 overflow-hidden">
          <span className="flex items-center gap-1 text-xs text-muted-foreground max-w-[160px] truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Toronto, ON</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <WhatspotLogo size="nav" />
        </div>
        <div className="flex items-center justify-end flex-1 gap-3 text-muted-foreground">
          <List className="h-5 w-5" />
          <span className="text-sm font-medium">Sign in</span>
        </div>
      </header>

      {/* Search row — mirrors SearchRow.jsx */}
      <div className="fixed top-14 left-0 right-0 z-40 bg-background">
        <div className="flex items-center gap-2 px-3 pt-5 pb-2 max-w-5xl mx-auto">
          <div className="flex-1 rounded-xl min-w-0">
            {/* Real SearchRow uses an animated multi-colour "ai-search-ring" gradient border
                here; deliberately not replicated for this static preview, so a plain grey
                border stands in for it. */}
            <div className="relative w-full flex items-center h-9 pl-10 pr-4 rounded-xl border border-border bg-card text-left text-base text-muted-foreground min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">Ask and you shall receive...</span>
              <span className="ml-2 shrink-0 rounded-full bg-green-100 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:bg-green-500/15 dark:text-green-400">
                Beta
              </span>
            </div>
          </div>
          <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full border border-border bg-card">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Feed tabs + deck — mirrors the feed-mode block in Home.jsx */}
      <div className="flex flex-col h-full overflow-hidden" style={{ paddingTop: '132px' }}>
        <div className="flex items-center justify-center gap-6 px-4 py-2">
          {FEED_TABS.map((label) => (
            <span
              key={label}
              className={
                label === ACTIVE_TAB
                  ? 'relative pb-1.5 text-sm font-medium text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-[#22c55e]'
                  : 'relative pb-1.5 text-sm font-medium text-muted-foreground'
              }
            >
              {label}
            </span>
          ))}
        </div>

        <div className="flex-1 flex items-center justify-center px-4 overflow-hidden">
          <div className="relative w-full max-w-sm mx-auto rounded-2xl overflow-hidden bg-card border border-border shadow-xl flex flex-col" style={{ height: 'clamp(420px, 65dvh, 620px)' }}>
            <div className="relative bg-muted overflow-hidden" style={{ height: '65%' }}>
              <img src={samplePhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </div>
            <div className="px-4 py-3 flex-1">
              <h2 className="text-lg font-bold text-foreground truncate">{SAMPLE_VENUE.name}</h2>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5 font-medium text-foreground">
                  <Star className="h-3.5 w-3.5 text-gray-500" />
                  {SAMPLE_VENUE.rating}
                </span>
                <span>{SAMPLE_VENUE.price}</span>
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {SAMPLE_VENUE.distanceKm} km
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SAMPLE_VENUE.descriptors.map((tag) => (
                  <span key={tag} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="absolute bottom-1 right-2 text-[9px] text-muted-foreground/60">
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
          {/* DialogHeader's own default classes include "sm:text-left" (for dialogs with
              body copy alongside), which otherwise overrides text-center at sm+ widths —
              sm:text-center here is needed to actually win at those breakpoints. */}
          <DialogHeader className="items-center text-center sm:text-center">
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
