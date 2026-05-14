# Issue #176 — Phase 2: A-4 - Venue Analytics Dashboard
GitHub: https://github.com/jaycawbo/whatspot/issues/176

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/176-p2-a4-analytics
git push origin jake/176-p2-a4-analytics
```

## Prior Learnings from Upstream Issues
<!-- Populated by upstream sessions -->
<!-- Check for venue portal patterns established in earlier issues before implementing -->


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Create a venue_analytics Supabase view computing: total requests, acceptance rate, redemption rate, avg response time, requests by hour, requests over last 7 days. Build a read-only analytics section in the venue portal with summary stat cards, peak times bar chart, and 7-day trend line chart.


## Supabase Migration Required
Claude will output SQL for the `venue_analytics` view.
You must run it in the Supabase dashboard before Claude can continue with the frontend.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add venue analytics dashboard with stat cards and charts"`
3. `git push origin jake/176-p2-a4-analytics`
4. `gh pr create --title "Project Bronco - Phase 2: A-4 - Venue Analytics Dashboard" --body "Implements venue_analytics view and portal analytics section. Closes #176." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/179-p3-a2-pos-integration.md (venue portal extended here — note shared layout/nav patterns)
