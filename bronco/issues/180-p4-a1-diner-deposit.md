# Issue #180 — Phase 4: A-1 - Diner Deposit (Stripe)
GitHub: https://github.com/jaycawbo/whatspot/issues/180

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/180-p4-a1-diner-deposit
git push origin jake/180-p4-a1-diner-deposit
```

## Prior Learnings from Upstream Issues

From #170 (Request Modal):
- **RequestModal** is at `src/components/bronco/RequestModal.jsx`. The Stripe payment sheet should be conditionally rendered inside this same Drawer (not a separate modal) when the venue requires a deposit.
- The modal receives the venue object via `useBronco().requestModalVenue`. Add `requires_deposit` and `deposit_amount_cents` fields to the venue object once those columns exist.
- The `create-request` edge function is at `supabase/functions/create-request/index.ts`. Add Stripe PaymentIntent creation there — return `client_secret` in the response so the modal can present the payment sheet before confirming the request.
- Party size is already captured (default 2, range 1–20). Deposit amount should not depend on party size unless the venue's settings specify per-person pricing.

From #179 (POS Integration):
- **walkin_venues** now has a `manually_set_at timestamptz` column. When you add deposit-related columns to this table, use `ALTER TABLE walkin_venues ADD COLUMN IF NOT EXISTS ...` to avoid conflicts.
- **venue_integrations** table created: `id, venue_id (→ walkin_venues), provider (toast|lightspeed|square), webhook_secret, settings (jsonb), is_active, created_at, updated_at`. UNIQUE on `(venue_id, provider)`. RLS: venue owners only via `venue_users` join.
- Deposit amount setting belongs in `walkin_venues` (e.g. `deposit_amount_cents integer DEFAULT 0`). A value of 0 means no deposit required — gate the Stripe flow on `deposit_amount_cents > 0`.
- **Venue portal** at `src/pages/VenuePortal.jsx`, route `/portal/:venueId`. The portal now has four sections: Live Requests, Waitlist, Analytics, POS Integrations. Add a Deposit/Billing section following the same layout pattern: `<section className="mb-8">` inside `<div className="max-w-xl mx-auto px-6 py-6">`.


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Add deposit fields to venues and requests. Integrate Stripe PaymentIntents with capture_method: manual — authorize on request creation, capture on acceptance, refund on redemption, forfeit on no-show. Build forfeit-deposit scheduled Edge Function. Add Stripe payment sheet to Request Modal when venue requires deposit. Add deposit amount setting to venue portal.


## Supabase Migration Required
Claude will output SQL to add deposit fields to the `venues` and `requests` tables.
You must run it in the Supabase dashboard before Claude can continue.

## External Services Required
- Stripe: Claude will create stubs with env var placeholders (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET).
  Wire up after getting credentials from the Stripe dashboard.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add Stripe deposit flow with authorize/capture/refund and forfeit Edge Function"`
3. `git push origin jake/180-p4-a1-diner-deposit`
4. `gh pr create --title "Project Bronco - Phase 4: A-1 - Diner Deposit (Stripe)" --body "Implements Stripe PaymentIntents deposit flow. Closes #180." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/181-p4-a2-venue-saas.md (Stripe is now integrated — note the existing setup so #181 can reuse it for subscriptions)
