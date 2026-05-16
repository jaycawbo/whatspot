# Issue #172 — Phase 1: B-4 - Requests Overlay
GitHub: https://github.com/jaycawbo/whatspot/issues/172

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/172-b4-requests-overlay
git push origin jake/172-b4-requests-overlay
```

## Prior Learnings from Upstream Issues

From #170 (Request Modal):
- **BroncoContext** (`src/context/BroncoContext.jsx`) owns `overlayOpen`, `openOverlay()`, `closeOverlay()`. Your overlay reads these.
- `useDinerRequests(dinerId)` from `@/hooks/useRequestRealtime` returns `{ activeRequests, isLoading }`. This is your data source for active request cards.
- RequestRow shape: `{ id, diner_id, venue_id, party_size, status, decline_comment, created_at, accepted_at, expires_at, holding_expires_at }`.
- Requests table has an optional `note text` column (CHECK char_length <= 140). Show it in the active card if present.
- `create-request` Edge Function returns `{ request }` on success. The request lands in `useDinerRequests` automatically via Realtime INSERT subscription.
- Cancelling uses the existing `cancel-request` Edge Function: `supabase.functions.invoke('cancel-request', { body: { request_id } })`.
- **Past requests**: fetch separately — `status IN ('declined','expired','redeemed','cancelled')` ordered by `created_at DESC`. Not in `useDinerRequests` (which only tracks active statuses). You'll need a separate query or extend the hook.

From #171 (Floating Pill) — to be filled in by that session.


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Build a bottom sheet overlay with Active and Past segmented tabs. Active cards: venue image, name, distance, status badge, server-derived countdown timer, Cancel button with inline confirm. Past cards: status badge, date, party size, chevron to venue page. Powered by useDinerRequests hook with live Realtime updates.


## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add requests overlay with active/past tabs and Realtime updates"`
3. `git push origin jake/172-b4-requests-overlay`
4. `gh pr create --title "Project Bronco - Phase 1: B-4 - Requests Overlay" --body "Implements requests overlay powered by useDinerRequests. Closes #172." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/175-p2-a3-waitlist.md (waitlist prompt replaces expired card state in this overlay)
- bronco/issues/177-p2-b1-push-notifications.md (push notifications trigger on request status changes shown in this overlay)
