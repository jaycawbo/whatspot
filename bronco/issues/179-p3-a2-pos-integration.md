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
You are working on Whatspot, a React + Supabase app. Review the venue schema, the is_available field, and the venue portal availability toggle before building this.

Build an opt-in POS integration layer that can automatically update is_available based on real floor state from Toast, Lightspeed, or Square.

---

ARCHITECTURE

Create a Supabase Edge Function: pos-webhook-handler

This function receives webhooks from POS systems and translates floor state into is_available updates.

---

WEBHOOK HANDLER

Route: POST /functions/v1/pos-webhook-handler

Auth: Validate a shared secret in the Authorization header (venue-specific, stored in a new venue_integrations table)

venue_integrations table:
  venue_id: uuid references venues(id)
  provider: text check (provider in ('toast','lightspeed','square'))
  webhook_secret: text
  is_active: boolean default true
  settings: jsonb    -- provider-specific config

Logic:
  1. Identify venue from webhook_secret
  2. Parse payload — each provider has a different shape (document expected shapes in comments)
  3. Derive available: boolean from payload
     Logic: available = (open_tables > 0) based on provider floor data
  4. Check manually_set_at on venues — if is_available was manually set in the last 5 minutes, do not override it
  5. UPDATE venues SET is_available = available WHERE id = venue_id
  6. Return 200

---

VENUE SCHEMA UPDATE

Add to venues:
  manually_set_at: timestamptz    -- updated whenever is_available is toggled manually in the portal

Update the availability toggle in the venue portal to also set manually_set_at = now() on change.

---

VENUE PORTAL

Add an "Integrations" section to venue portal settings.
  - Toggle to enable/disable POS integration
  - Show connected provider name + last sync time
  - Manual override note: "Even with POS connected, you can still manually toggle availability — your manual setting takes priority for 5 minutes"


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
