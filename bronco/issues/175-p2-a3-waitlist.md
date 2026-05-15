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
