import React from 'react';
import WhatspotLogo from '@/components/brand/WhatspotLogo';

const CONTACT_EMAIL = 'TODO-contact@whatspot.co';
const UPDATED = 'September 20, 2026';

const PRIVACY = [
  ['What we collect', [
    'Account info from Google sign-in: your email address, name and profile photo.',
    'Your activity in the app: venues you swipe on, save, mark as visited or loved, search queries, and lists you create or share.',
    'Approximate or precise location, only if you allow it in your browser, used to show places near you.',
    'Basic technical data such as device type and error logs.',
  ]],
  ['How we use it', [
    'To sign you in and keep your Spots and lists.',
    'To personalize your Feed and Search results.',
    'To keep the app working and fix problems.',
    'We do not sell your personal information.',
  ]],
  ['Who processes it', [
    'Supabase (database and sign-in), Google (sign-in and Places data), Vercel (hosting) and Google Gemini (search understanding). They process data only to provide their services to us.',
  ]],
  ['Sharing', [
    'Lists you choose to share are visible to people with the link. Nothing else is shared with other users unless you share it.',
  ]],
  ['Your choices', [
    `You can ask us to delete your account and data at any time by emailing ${CONTACT_EMAIL}.`,
    'You can turn off location access in your browser settings.',
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
