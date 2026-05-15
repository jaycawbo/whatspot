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
<!-- Populated by sessions #175 (Waitlist), #176 (Analytics), #178 (Native Prep) -->
<!-- Check for venue portal layout patterns and hook extraction conventions before implementing -->


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
