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
<!-- Populated by sessions #170 (Request Modal) and #173 (Editorial Collections) -->
<!-- Check for venue card patterns and CTA interfaces before building the Spots screen -->


## YOUR PROMPT
You are working on Whatspot, a React + Supabase app. Review the existing codebase — specifically the heart/save icon already in the top nav, any existing favouriting logic, and the Supabase client — before building this.

Build the Spots feature: saved venues with named lists.

---

DATA MODEL

Create tables:

spots
  id: uuid primary key default gen_random_uuid()
  diner_id: uuid not null references diners(id)
  venue_id: uuid not null references venues(id)
  created_at: timestamptz default now()
  UNIQUE(diner_id, venue_id)

spot_lists
  id: uuid primary key default gen_random_uuid()
  diner_id: uuid not null references diners(id)
  name: text not null            -- e.g. "Date night", "Lunch near work"
  created_at: timestamptz default now()

spot_list_items
  list_id: uuid references spot_lists(id) on delete cascade
  spot_id: uuid references spots(id) on delete cascade
  PRIMARY KEY (list_id, spot_id)

RLS: all tables — diner can only read/write their own rows.

---

SAVE INTERACTION

The heart icon on venue cards (feed, search results, venue page) saves/unsaves a venue.
  - Filled heart = saved; outline = unsaved
  - Optimistic update: toggle immediately, revert on error
  - On first save: create a spots row
  - On unsave: delete the spots row (and remove from any lists)

---

SPOTS SCREEN

Accessible via heart icon in top nav.

Layout:
  - Default view: flat list of all saved venues
  - Each saved venue shows: thumbnail, name, distance, is_available dot
  - "Request Walk-In" CTA on each card (same as main venue card)
  - "New List" button: creates a named list
  - Named lists shown as sections or tabs
  - Add a spot to a list: long-press or secondary action on a saved venue card

---

AVAILABILITY BADGE

The is_available status shown on saved venue cards must reflect real-time state.

Subscribe to Realtime changes on venues WHERE id IN (saved venue ids) — update badges live.


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
