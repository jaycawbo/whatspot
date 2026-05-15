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
<!-- Populated by sessions #172 (Requests Overlay) and #174 (Spots) -->
<!-- Check for overlay card state patterns and table conventions before implementing -->


## YOUR PROMPT
You are working on Whatspot, a React + Supabase app. Review the existing requests schema, the RequestsOverlay component, and Realtime hooks before building this.

When a request expires, offer the diner the option to join a waitlist for that venue.

---

DATA MODEL

Create table: waitlist_entries

  id: uuid primary key default gen_random_uuid()
  diner_id: uuid not null references diners(id)
  venue_id: uuid not null references venues(id)
  party_size: integer not null
  status: text not null default 'waiting' check (status in ('waiting','notified','cancelled'))
  created_at: timestamptz default now()
  notified_at: timestamptz

RLS: diner can read/insert/update their own rows. Venue portal can read all entries for their venue.

---

UX: Expiry prompt

When a request transitions to 'expired' (received via Realtime):

  In the active requests card in the Requests Overlay, replace the expired state with:

  "Didn't hear back from [Venue Name]."
  "Join their waitlist?"

  Two buttons: "Join Waitlist" | "Dismiss"

  - "Join Waitlist": inserts a waitlist_entries row with the same party_size, shows confirmation "You're on the waitlist"
  - "Dismiss": collapses back to standard expired state, moves to Past tab on next refresh

---

VENUE PORTAL

In Phase 2, waitlist is display-only for venues — they can see entries in a simple list.

Notification of waitlist diners is a Phase 3 feature.

Add waitlist queue to the venue portal settings screen: read-only list of waiting diners with party size and wait time.


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
