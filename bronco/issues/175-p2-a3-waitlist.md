# Issue #175 — Phase 2: A-3 - Waitlist on Expiry
GitHub: https://github.com/jaycawbo/whatspot/issues/175

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/175-p2-a3-waitlist
git push origin jake/175-p2-a3-waitlist
```

## Prior Learnings from Upstream Issues

From #172 (Requests Overlay):
- **RequestsOverlay** is at `src/components/bronco/RequestsOverlay.jsx`. The expired card state lives in the `ActiveCard` sub-component inside that file.
- To add the "Join waitlist?" prompt: when `request.status === 'expired'`, replace the card actions section with the waitlist join CTA. Import a new `WaitlistJoinButton` component or add inline.
- The overlay only shows `activeRequests` (pending + accepted) from `useDinerRequests`. Expired requests are NOT shown in Active tab (they move to Past). You'll need to expose expired requests — either extend `useDinerRequests` to include 'expired' status briefly, or listen for Realtime UPDATE events that flip status to 'expired' and show a prompt before the card disappears.
- Recommended: on `status === 'expired'` Realtime UPDATE, show a transient "Join their waitlist?" banner at the top of the Active tab for 30 seconds before the card moves to Past.
- `venuesMap` in the overlay maps `venue_id → { id, name, photo_url, google_place_id, lat, lng }` — join waitlist_entries against this map for the venue name.
- Cancel button uses `cancel-request` Edge Function. Waitlist join will use a separate Edge Function or direct Supabase insert (with RLS).

From #174 (Spots):
- **spot_lists** + **spot_list_items** tables created (see PR #174 for migration SQL). RLS: owner-only via `user_id = auth.uid()`.
- **useBroncoSpotLists** hook (`src/hooks/useBroncoSpotLists.js`): `{ lists, savedIds, isLoading, createList, saveVenue, removeVenue }`.
- `spot_list_items` columns: `id, list_id (→ spot_lists.id), venue_id (→ venues.id), created_at`. UNIQUE(list_id, venue_id).
- Waitlist entries should reference `venue_id` (venues.id UUID), same pattern as spot_list_items.


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Create waitlist_entries table. When a request transitions to expired via Realtime, replace the expired card state in the Requests Overlay with a "Join their waitlist?" prompt. On join: insert waitlist entry, show confirmation. Add read-only waitlist queue to venue portal.


## Supabase Migration Required
Claude will output SQL for the `waitlist_entries` table.
You must run it in the Supabase dashboard before Claude can continue with the frontend.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add waitlist on expiry with join prompt and venue portal queue view"`
3. `git push origin jake/175-p2-a3-waitlist`
4. `gh pr create --title "Project Bronco - Phase 2: A-3 - Waitlist on Expiry" --body "Implements waitlist_entries table and expired card state in overlay. Closes #175." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/179-p3-a2-pos-integration.md (venue portal was extended here — note any shared portal patterns)
