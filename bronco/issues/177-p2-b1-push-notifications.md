# Issue #177 — Phase 2: B-1 - Request Polish + Push Notifications
GitHub: https://github.com/jaycawbo/whatspot/issues/177

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/177-p2-b1-push-notifications
git push origin jake/177-p2-b1-push-notifications
```

## Prior Learnings from Upstream Issues
<!-- Populated by session #172 (Requests Overlay) -->
<!-- Check for request status values and overlay card state structure before implementing -->


## YOUR PROMPT
You are working on Whatspot, a React + Supabase app. Review the existing notification handling, Supabase Edge Functions, and any existing push setup before building this.

Implement push notifications for the diner app using the Web Push API (PWA). SMS via Twilio is optional and opt-in.

---

WEB PUSH

1. Service Worker

   Create or update the service worker to handle push events.

   On push event, display a notification with:
     - Title: venue name
     - Body: status-specific message (see events below)
     - Icon: Whatspot logo
     - Data: { request_id, venue_id } for tap routing

2. Subscription

   On diner sign-in, request notification permission.

   If granted, subscribe to web push and store the PushSubscription in a new table:

   push_subscriptions
     id: uuid primary key
     diner_id: uuid references diners(id)
     subscription: jsonb    -- full PushSubscription object
     created_at: timestamptz

3. Edge Function: send-push-notification

   Triggered by Supabase Database Webhooks on requests table UPDATE.

   For each relevant status change, send a push notification to the diner's subscriptions.

   Events and messages:
     status → 'accepted':   "[Venue] is ready for you. Your table is held for X minutes."
     status → 'declined':   "[Venue] can't seat you right now. [comment if present]"
     status → 'expired':    "Your request to [Venue] expired. Want to join their waitlist?"
     holding_expires soon:  "Heads up — [Venue] is holding your table for 5 more minutes."

   Use the web-push npm package (or equivalent Deno-compatible library) to send.

   VAPID keys should be stored in Supabase secrets, not in code.

---

SMS (OPT-IN)

Add an SMS opt-in toggle to the diner profile/settings screen.
  - Requires phone number to be verified first (add a phone_verified boolean to diners)
  - When opted in, the send-push-notification Edge Function also sends an SMS via Twilio for 'accepted' and 5-min holding warning events only — not for every event

Twilio config:
  - Account SID, Auth Token, From number stored in Supabase secrets
  - Twilio REST API called from the Edge Function — do not use the Twilio SDK if it is not Deno-compatible; use fetch directly against the Twilio API endpoint

---

"ON OUR WAY" STATE

Add an "On Our Way" button to accepted request cards in the Requests Overlay.
  - Tapping it sends a notification to the venue portal that the diner is en route
  - This is a courtesy signal only — no status change on the request


## Supabase Migration Required
Claude will output SQL for the `push_subscriptions` table.
You must run it in the Supabase dashboard before Claude can continue.

## External Services Required
- Twilio: Claude will create stubs with env var placeholders (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER). Wire up after getting credentials.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add Web Push notifications, Twilio SMS stubs, and On Our Way request state"`
3. `git push origin jake/177-p2-b1-push-notifications`
4. `gh pr create --title "Project Bronco - Phase 2: B-1 - Request Polish + Push Notifications" --body "Implements push notifications and On Our Way state. Closes #177." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/178-p3-a1-native-prep.md (PWA service worker is a web-only dependency — document it as a native blocker)
