# Issue #179 — Phase 3: A-2 - POS Integration
GitHub: https://github.com/jaycawbo/whatspot/issues/179

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/179-p3-a2-pos-integration
git push origin jake/179-p3-a2-pos-integration
```

## Prior Learnings from Upstream Issues

From #175 (Waitlist):
- **Venue portal scaffold** at `src/pages/VenuePortal.jsx`, route `/portal/:venueId`. Authentication required (redirects to sign-in prompt if unauth'd).
- Portal currently shows: live requests summary (pending/accepted counts via `useVenueRequests`) and waitlist queue (from `waitlist_entries` table).
- Add an "Integrations" tab/section to this portal page. Keep the portal layout consistent: `<header>`, `<div className="max-w-xl mx-auto px-6 py-6">`, `<section>` blocks.
- `waitlist_entries` table: `id, diner_id, venue_id, request_id, created_at, status (waiting|notified|seated|cancelled)`, Realtime channel `waitlist-{venueId}`.
- `useVenueRequests(venueId)` from `src/hooks/useRequestRealtime.js` — reuse in portal.

From #176 (Analytics):
- **venue_analytics** Supabase view must be created before the portal analytics section works. SQL: `CREATE OR REPLACE VIEW venue_analytics AS SELECT v.id AS venue_id, COUNT(r.id) AS total_requests, ROUND(COUNT(r.id) FILTER (WHERE r.status IN ('accepted','redeemed'))::numeric / NULLIF(COUNT(r.id),0)*100,1) AS acceptance_rate_pct, ROUND(COUNT(r.id) FILTER (WHERE r.status='redeemed')::numeric / NULLIF(COUNT(r.id) FILTER (WHERE r.status IN ('accepted','redeemed')),0)*100,1) AS redemption_rate_pct, v.avg_response_sec FROM venues v LEFT JOIN requests r ON r.venue_id=v.id GROUP BY v.id, v.avg_response_sec;` + `GRANT SELECT ON venue_analytics TO authenticated;`
- `avg_response_sec` is read from the `venues` table via the view's GROUP BY. If you add columns to `venues`, verify the GROUP BY in `venue_analytics` stays valid (add new venue columns to GROUP BY if needed).
- Chart data (7-day trend, hourly distribution) is computed client-side from a `requests` fetch — no extra views required.
- Recharts is installed (`recharts ^2.15.4`). Use `BarChart/Bar` for hourly peaks, `LineChart/Line` for daily trend. `ResponsiveContainer height={120}` fits the portal column width cleanly.
- Portal page layout as of #176: sections in order — Live Requests, Waitlist, Analytics. Add new sections (e.g. Integrations) as additional `<section className="mb-8">` blocks inside `<div className="max-w-xl mx-auto px-6 py-6">`.

From #178 (Native Prep) — to be filled in by that session.


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Create venue_integrations table (provider, webhook_secret, settings). Build pos-webhook-handler Edge Function to receive webhooks from Toast, Lightspeed, and Square, translate floor state into is_available updates. Manual override wins over webhook if is_available was manually set in the last 5 minutes (tracked via manually_set_at). Add Integrations section to venue portal settings.


## Supabase Migration Required
Claude will output SQL for the `venue_integrations` table and any changes to the venues table (manually_set_at column).
You must run it in the Supabase dashboard before Claude can continue.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add POS integration with webhook handler and manual override logic"`
3. `git push origin jake/179-p3-a2-pos-integration`
4. `gh pr create --title "Project Bronco - Phase 3: A-2 - POS Integration" --body "Implements venue_integrations table and pos-webhook-handler Edge Function. Closes #179." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/180-p4-a1-diner-deposit.md (venues table was changed here — note any column additions that affect the deposit feature)
- bronco/issues/181-p4-a2-venue-saas.md (note same)
