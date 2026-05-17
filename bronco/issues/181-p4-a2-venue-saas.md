# Issue #181 — Phase 4: A-2 - Venue SaaS Subscription
GitHub: https://github.com/jaycawbo/whatspot/issues/181

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/181-p4-a2-venue-saas
git push origin jake/181-p4-a2-venue-saas
```

## Prior Learnings from Upstream Issues

From #180 (Diner Deposit):
- **Stripe is fully wired** into three edge functions. Same `stripe@14` import via `https://esm.sh/stripe@14?target=deno` pattern.
- **Env vars needed**: `STRIPE_SECRET_KEY` (server-side, Supabase Edge Function secret), `STRIPE_WEBHOOK_SECRET` (for webhook verification), `VITE_STRIPE_PUBLISHABLE_KEY` (client-side, Vercel env var).
- **`@stripe/stripe-js` and `@stripe/react-stripe-js`** are already installed in package.json — do not reinstall.
- **`create-request`** edge function now exists at `supabase/functions/create-request/index.ts`. It reads `deposit_amount_cents` from `walkin_venues` and creates a PaymentIntent with `capture_method: manual` when > 0. It returns `client_secret` alongside the request.
- **`accept-request`** captures the PaymentIntent (`stripe.paymentIntents.capture`) on venue accept and sets `deposit_status = 'captured'`.
- **`redeem-request`** refunds the PaymentIntent (`stripe.refunds.create`) on diner arrival and sets `deposit_status = 'refunded'`.
- **`forfeit-deposit`** is a new scheduled Edge Function that cancels accepted requests whose holding window expired, marks captured deposits as `'forfeited'`, and releases authorized-but-not-captured intents.
- **VenuePortal** is at `src/pages/VenuePortal.jsx` (route `/portal/:venueId`). It now has four sections: Live Requests, Waitlist, Deposit / Billing, POS Integrations. Add the SaaS Billing section following the same `<section className="mb-8">` pattern inside `<div className="max-w-xl mx-auto px-6 py-6">`.
- **`walkin_venues`** now has `deposit_amount_cents integer NOT NULL DEFAULT 0` and `manually_set_at timestamptz`.
- **`requests`** now has `stripe_payment_intent_id text`, `deposit_status text` (authorized|captured|refunded|forfeited), `deposit_amount_cents integer`, and `note text`.
- **`venue_integrations`** table exists with RLS (owner-only via venue_users join).
- Migration filename used: `20260519000002_stripe_deposit.sql`. Use `20260519000003_venue_saas.sql` for this issue.


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Add subscription fields to venues. Implement Free (20 requests/month) and Pro (unlimited) tiers enforced via check_venue_request_limit Postgres function called in create-request Edge Function. Build Billing section in venue portal with Stripe Checkout and Customer Portal session Edge Functions. Handle customer.subscription.updated and customer.subscription.deleted webhooks.


## Supabase Migration Required
Claude will output SQL to add subscription fields to the `venues` table and create
the `check_venue_request_limit` Postgres function.
You must run it in the Supabase dashboard before Claude can continue.

## External Services Required
- Stripe: Reuses existing setup from #180. Claude will add Stripe Checkout and Customer Portal
  session Edge Functions using the same env vars (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET).

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add venue SaaS subscription tiers with Stripe Checkout and request limit enforcement"`
3. `git push origin jake/181-p4-a2-venue-saas`
4. `gh pr create --title "Project Bronco - Phase 4: A-2 - Venue SaaS Subscription" --body "Implements Free/Pro tiers with Stripe Checkout and request limit Postgres function. Closes #181." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
This is the final Bronco issue. No downstream files to update.
