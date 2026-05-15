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
You are working on Whatspot, a React + Supabase app. Review the existing requests schema, the accept-request Edge Function, and auth setup before building this.

Add an optional diner deposit system using Stripe, collected on request acceptance and released or forfeited based on arrival.

---

DATA MODEL UPDATES

Add to venues:
  deposit_amount_cents: integer default 0    -- 0 = no deposit required
  deposit_currency: text default 'cad'

Add to diners:
  stripe_customer_id: text
  default_payment_method_id: text

Add to requests:
  stripe_payment_intent_id: text
  deposit_status: text check (deposit_status in ('none','held','released','forfeited'))
  deposit_amount_cents: integer    -- snapshot of venue's deposit amount at time of request

---

FLOW

On request creation (if venue requires deposit):
  1. Create a Stripe PaymentIntent with capture_method: 'manual' (authorize only, do not capture)
  2. Store payment_intent_id on the request
  3. Return client_secret to the diner app for payment confirmation

Diner app:
  Show Stripe payment sheet in the Request Modal when venue requires deposit.
  Do not submit the request until payment is authorized.

On accept-request Edge Function:
  If deposit_amount_cents > 0:
    Capture the PaymentIntent (charge the card)
  Set deposit_status = 'held'

On redeem-request Edge Function:
  Refund the captured payment via Stripe Refund API
  Set deposit_status = 'released'

On holding window expiry with no arrival:
  New Edge Function: forfeit-deposit
    Triggered by scheduled job checking for accepted requests past holding_expires_at
    Do NOT refund — deposit is forfeited
    Set deposit_status = 'forfeited'
    Update request status = 'cancelled'

---

VENUE PORTAL

Add deposit amount setting to venue portal settings screen.
  - Input: deposit amount (dollars, converted to cents on save)
  - Toggle: require deposit yes/no (sets deposit_amount_cents to 0 when off)

---

STRIPE CONFIG

Store Stripe secret key in Supabase secrets.

Use Stripe's official API via fetch in Edge Functions — do not rely on a Node-specific Stripe SDK.

Store Stripe publishable key in app environment config.


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
