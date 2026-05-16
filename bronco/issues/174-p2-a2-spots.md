# Issue #174 — Phase 2: A-2 - Spots
GitHub: https://github.com/jaycawbo/whatspot/issues/174

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/174-p2-a2-spots
git push origin jake/174-p2-a2-spots
```

## Prior Learnings from Upstream Issues

From #170 (Request Modal):
- Walk-In CTA on any venue surface calls `openRequestModal(venue)` from `useBronco()`. No local modal needed — it's mounted globally.
- Spots venue cards that show walk-in availability should follow the same pattern as VenueCard: show the green dot + "Accepting walk-in requests now" when `venue.is_available === true`, and the "Request Walk-In" button calling `openRequestModal(venue)`.
- `BroncoProvider` already wraps the full app.

From #173 (Editorial Collections) — to be filled in by that session.


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Create spots, spot_lists, and spot_list_items tables with RLS. Wire heart icon on venue cards to save/unsave with optimistic updates. Build Spots screen (accessible from top nav heart icon): flat list of saved venues with availability badges, "New List" creation, and named list organization. Subscribe to Realtime venue changes for live availability badge updates.


## Supabase Migration Required
Claude will output SQL for `spots`, `spot_lists`, and `spot_list_items` tables with RLS policies.
You must run it in the Supabase dashboard before Claude can continue with the frontend.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add Spots screen with save/unsave, lists, and live availability badges"`
3. `git push origin jake/174-p2-a2-spots`
4. `gh pr create --title "Project Bronco - Phase 2: A-2 - Spots" --body "Implements Spots screen with Supabase tables and Realtime. Closes #174." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/175-p2-a3-waitlist.md (waitlist feature is separate but note any shared table patterns)
- bronco/issues/178-p3-a1-native-prep.md (Spots screen is a major new screen — document it for native audit)
