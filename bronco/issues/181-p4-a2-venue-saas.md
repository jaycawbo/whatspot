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
