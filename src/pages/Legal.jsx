import React from 'react';
import WhatspotLogo from '@/components/brand/WhatspotLogo';

const CONTACT_EMAIL = 'hello@whatspot.co';
const UPDATED = 'September 20, 2026';

const PRIVACY = [
  ['What we collect', [
    'Account info from Google sign-in: your email address, name and profile photo.',
    'Waitlist and invite info: the email you submit to join the waitlist, how you heard about us, and the invite code you use.',
    'Your activity in the app: venues you swipe on, save, mark as visited or loved, search queries, and lists you create or share. If you are not signed in, this is tied to a random anonymous ID stored on your device.',
    'Your location, only if you allow it in your browser, or a place you type in. It is used to show spots near you and is also remembered on your device.',
    'Basic technical data such as your IP address and error logs, which our hosting and database providers receive when you use the app.',
  ]],
  ['How we use it', [
    'To sign you in and keep your Spots and lists.',
    'To personalize your Feed and Search results based on your activity.',
    'To manage the closed test, including invite codes and the waitlist.',
    'To keep the app working and fix problems.',
    'We do not sell your personal information and we do not run third-party advertising or analytics.',
  ]],
  ['Who processes it', [
    'Supabase (database and sign-in), Google (sign-in and Places data), Vercel (hosting), Google Gemini (understanding search queries) and CARTO (map tiles). They receive only what they need to provide their service to us.',
  ]],
  ['Storage on your device', [
    'We use your browser storage, not advertising cookies, to remember your session, anonymous ID, recent searches, location and filters.',
  ]],
  ['Sharing', [
    'Lists you choose to share are visible to anyone with the link. Nothing else is shared with other users unless you share it.',
  ]],
  ['Your choices', [
    `You can ask us to delete your account and data at any time by emailing ${CONTACT_EMAIL}.`,
    'You can turn off location access in your browser settings and clear site data to remove what is stored on your device.',
    'Children: WhatSpot is not for anyone under 13.',
  ]],
  ['Changes', [
    'If we change this policy we will update the date above.',
  ]],
];

const TERMS = [
  ['Using WhatSpot', [
    'WhatSpot helps you discover, organize and share places. You must be at least 13 to use it.',
    'You are responsible for your account and the content you add.',
  ]],
  ['Acceptable use', [
    'Do not misuse the service, attempt to break or overload it, or use it to harm others.',
    'We may suspend access to protect the service or other users.',
  ]],
  ['Place information', [
    'Venue details such as hours and ratings come from third parties and may be out of date. Check with the venue before you go.',
  ]],
  ['No warranty', [
    'WhatSpot is provided as is while in closed testing. Features may change or be removed.',
  ]],
  ['Contact', [`Questions: ${CONTACT_EMAIL}.`]],
];

export default function Legal({ kind }) {
  const isPrivacy = kind === 'privacy';
  const sections = isPrivacy ? PRIVACY : TERMS;
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <a href="/" aria-label="WhatSpot home"><WhatspotLogo size="hero" /></a>
        <h1 className="mt-8 text-2xl font-semibold">{isPrivacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last updated {UPDATED}</p>
        {sections.map(([title, items]) => (
          <section key={title} className="mt-6">
            <h2 className="text-lg font-semibold">{title}</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-muted-foreground">
              {items.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </section>
        ))}
        <p className="mt-10 text-sm">
          <a className="underline" href={isPrivacy ? '/terms' : '/privacy'}>
            {isPrivacy ? 'Terms of Service' : 'Privacy Policy'}
          </a>
        </p>
      </div>
    </div>
  );
}
