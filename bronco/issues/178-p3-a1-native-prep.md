# Issue #178 — Phase 3: A-1 - Native App Preparation
GitHub: https://github.com/jaycawbo/whatspot/issues/178

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/178-p3-a1-native-prep
git push origin jake/178-p3-a1-native-prep
```

## Prior Learnings from Upstream Issues
<!-- Populated by all Phase 1 and Phase 2 sessions -->
<!-- Check here for a full picture of web-only dependencies introduced across the project -->

From #177 (Push Notifications):
- **Web Push service worker** at `public/sw.js` — handles `push` and `notificationclick` events. Registered via `usePushNotifications.js`. This is a hard web-only dependency; Capacitor Push Notifications plugin replaces it entirely for native.
- **usePushNotifications** hook at `src/hooks/usePushNotifications.js`: uses `navigator.serviceWorker`, `PushManager`, `Notification`, and `window` — all web-only APIs. Guard with `'serviceWorker' in navigator && 'PushManager' in window` (already done). Replace with `@capacitor/push-notifications` on native.
- **push_subscriptions** Supabase table: stores Web Push endpoint + VAPID keys per user. For native, store FCM/APNs device tokens instead, in a separate column or table.
- **send-push-notification** Edge Function: triggered by Supabase Database Webhook on `requests` UPDATE. Uses `npm:web-push@3.6.7`. Needs VAPID env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`.
- **Twilio SMS**: stubs in `send-push-notification/index.ts`. Reads `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — silently skips if unset. Opt-in flag is `diners.sms_opt_in` (boolean). Triggers on: `accepted` status only (holding 5-min warning handled separately).
- **VITE_VAPID_PUBLIC_KEY** env var required on the frontend (in `.env.local` and Vercel). Generate VAPID keys with `npx web-push generate-vapid-keys`.
- **"On Our Way" state**: client-side toggle on accepted request cards in `RequestsOverlay.jsx`. No DB column yet — currently optimistic UI only. If native needs to notify the venue, add `on_our_way_at timestamptz` to `requests` and update via direct upsert (diner owns their own request rows via RLS).


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Audit components for web-only dependencies and document in NATIVE_BLOCKERS.md. Extract all Supabase queries, Edge Function calls, and Realtime subscriptions from components into dedicated hook/service files. Document routing structure and its React Native equivalents. Consolidate environment config into a single module. Output NATIVE_READINESS.md summarising remaining work before Expo can be introduced.


## Note: This is primarily an audit and refactor issue
No new Supabase migrations are expected. Output files are NATIVE_BLOCKERS.md and NATIVE_READINESS.md.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Native app preparation: extract hooks, audit blockers, output readiness docs"`
3. `git push origin jake/178-p3-a1-native-prep`
4. `gh pr create --title "Project Bronco - Phase 3: A-1 - Native App Preparation" --body "Extracts Supabase logic into hooks and documents native blockers. Closes #178." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/179-p3-a2-pos-integration.md (note any hook extraction patterns established here that POS integration should follow)
- bronco/issues/180-p4-a1-diner-deposit.md (note same)
- bronco/issues/181-p4-a2-venue-saas.md (note same)
