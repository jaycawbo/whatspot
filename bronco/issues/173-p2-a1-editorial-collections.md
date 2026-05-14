# Issue #173 — Phase 2: A-1 - Feed Editorial Collections
GitHub: https://github.com/jaycawbo/whatspot/issues/173

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/173-p2-a1-editorial-collections
git push origin jake/173-p2-a1-editorial-collections
```

## Prior Learnings from Upstream Issues
<!-- Populated by session #170 (Request Modal) — compact venue cards share the "Request Walk-In" CTA -->


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Create a collections table (title, subtitle, sort order, venue_ids array). Render horizontal scroll rows on the feed screen, one per active collection. Filter joined venues by is_available=true. Compact venue card variant with "Request Walk-In" CTA accessible without navigating to venue page.


## Supabase Migration Required
Claude will output SQL for the `collections` table. You must run it in the Supabase dashboard
before Claude can continue with the frontend implementation.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add editorial collections with horizontal scroll rows on feed"`
3. `git push origin jake/173-p2-a1-editorial-collections`
4. `gh pr create --title "Project Bronco - Phase 2: A-1 - Feed Editorial Collections" --body "Implements editorial collections table and feed UI. Closes #173." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/174-p2-a2-spots.md (spots may share the compact venue card variant built here)
