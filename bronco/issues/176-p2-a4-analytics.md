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
You are working on Whatspot, a React + Supabase app. Review the existing venue portal structure before building this.

Add a read-only analytics dashboard to the venue portal.

---

DATA

All analytics are computed from the requests table. No separate analytics tables needed.

Use Supabase views or Edge Functions for aggregation.

Create a Supabase view: venue_analytics

  For a given venue_id, compute:
    - total_requests: count of all requests
    - accepted_count: count where status = 'accepted'
    - declined_count: count where status = 'declined'
    - expired_count: count where status = 'expired'
    - redeemed_count: count where status = 'redeemed'
    - acceptance_rate: accepted_count / total_requests (as percentage)
    - redemption_rate: redeemed_count / accepted_count (as percentage)
    - avg_response_sec: already on venues table — surface here too
    - requests_by_hour: array of { hour: 0-23, count } for peak time chart
    - requests_last_7_days: array of { date, count }

---

UI

Add an "Analytics" section to the venue portal navigation.

Display:
  - Summary stat cards: Total Requests, Acceptance Rate, Redemption Rate, Avg Response Time
  - Bar chart: requests by hour of day (peak times)
  - Line chart: requests over last 7 days
  - Use an existing charting library already in the project; if none exists, use recharts

Keep the design clean and minimal — this is a host-stand tablet context, not a business intelligence dashboard.


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
