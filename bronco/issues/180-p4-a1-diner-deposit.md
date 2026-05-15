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
<!-- Populated by sessions #170 (Request Modal) and #179 (POS Integration) -->
<!-- Check for venues table column additions and request modal prop interface before implementing -->


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
