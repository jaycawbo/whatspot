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
<!-- Populated by session #180 (Diner Deposit) -->
<!-- Check for existing Stripe setup and env vars before implementing — do not duplicate -->


## YOUR PROMPT
You are working on Whatspot, a React + Supabase app. Review existing venue schema and portal structure before building this.

Add a SaaS subscription tier system for venues using Stripe Billing.

---

DATA MODEL

Add to venues:
  subscription_status: text default 'trialing' check (status in ('trialing','active','past_due','cancelled'))
  subscription_tier: text default 'free' check (tier in ('free','pro'))
  trial_ends_at: timestamptz
  stripe_subscription_id: text
  stripe_customer_id: text

---

TIERS

Free:
  - Up to 20 requests/month
  - No analytics dashboard
  - No POS integration

Pro:
  - Unlimited requests
  - Full analytics
  - POS integration
  - Priority support badge in diner app

---

ENFORCEMENT

Create a Postgres function: check_venue_request_limit(venue_id)

  Returns boolean: can this venue receive a new request?
  Free tier: count requests this calendar month < 20
  Pro tier: always true
  Trialing: always true until trial_ends_at

Call this function in the create-request Edge Function before inserting.

Return 402 with message "This venue has reached its monthly request limit" if limit exceeded.

---

BILLING PORTAL

Add a "Billing" section to the venue portal.
  - Show current tier, status, renewal date
  - "Upgrade to Pro" CTA (links to Stripe Checkout)
  - "Manage Billing" link (Stripe Customer Portal)

Stripe Checkout and Customer Portal sessions created via Edge Functions.

Store all Stripe keys in Supabase secrets.

Stripe webhook handler Edge Function:
  Handle: customer.subscription.updated, customer.subscription.deleted
  Update venue subscription_status and subscription_tier accordingly.


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
