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
<!-- Jake: paste your detailed implementation prompt below -->

Implement Web Push API notifications via PWA service worker. Create push_subscriptions table. Build send-push-notification Edge Function triggered by Database Webhooks on request status changes. Add opt-in SMS notifications via Twilio for accepted and 5-min holding warning events only. Add "On Our Way" state to accepted request cards in the Requests Overlay.


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
