# Project Bronco — Shared Context

This file is prepended to every issue session. Keep it up to date.

## Core Project Context
CLAUDE.md is automatically loaded by Claude Code and covers the full tech stack,
coding rules, protected files, and Git workflow. Do not duplicate it here.

## Project Bronco Context

### What Project Bronco Will Enable
A two-sided mobile platform connecting diners who want to eat now with restaurants that have walk-in capacity available. Diners send real-time walk-in requests; venues accept or decline within a short configurable window.

The product must never feel like a reservation app, waitlist app, or booking platform. It should feel like lightweight real-time dining coordination — reducing uncertainty around walk-ins, helping users confidently go out now.

### Two Separate Applications, One Backend
Diner app — mobile-first PWA (iOS + Android browser). Discovery-first. Map-centric. Requests are a contextual overlay on top of venue discovery, not a primary navigation destination.

Venue portal — browser-based PWA optimized for host-stand tablets. Full-screen alert model for incoming requests.

Both share a single Supabase backend.

### Tech Stack
- Frontend: React
- Backend: Supabase (Postgres + Edge Functions + Realtime)
- Real-time layer: Supabase Realtime (Postgres changes broadcast via WebSocket — no custom WebSocket server)
- State machine: Postgres triggers + Edge Functions. The database is the source of truth for all request state.
- SMS: Twilio (optional, opt-in for diners; fallback for venue portal when tab is inactive)
- Payments: Stripe (Phase 4)
- Push notifications: Web Push API (PWA service worker)

### Core Data Model

**venues**
id, name, address, coordinates (point), category (food|drinks|coffee|bakery|bar),
operating_hours (jsonb), walk_in_capacity, acceptance_window_sec (60|120|180, default 120),
holding_window_min (default 30), is_available (boolean), sms_fallback_number,
avg_response_sec (computed: rolling average of accepted_at - created_at, null until first accepted request)

**diners**
id (references auth.users), name, phone

**requests**
id, diner_id, venue_id, party_size,
status: pending | accepted | declined | expired | redeemed | cancelled,
decline_comment (max 200 chars, optional),
created_at, accepted_at, expires_at (created_at + acceptance_window_sec), holding_expires_at (accepted_at + holding_window_min),
stripe_payment_intent_id, deposit_status, deposit_amount_cents (Phase 4)

### Request State Machine
- pending → accepted (venue accepts within window)
- pending → declined (venue declines, optional comment)
- pending → expired (acceptance window elapses with no action)
- pending → cancelled (diner cancels, or auto-cancelled when a competing request is accepted)
- accepted → redeemed (venue marks diner as arrived)
- accepted → cancelled (holding window expires with no arrival)

All status transitions happen server-side only (Edge Functions + Postgres triggers). Clients never write status directly.

On acceptance: on_request_accepted trigger fires atomically: sets accepted_at, sets holding_expires_at, cancels all other pending requests from the same diner, updates avg_response_sec on the venue.

On expiry: expire-pending-requests Edge Function runs every 30 seconds, updates status, broadcasts via Realtime.

### Supabase Architecture Decisions
- Realtime replaces a custom WebSocket server. Clients subscribe to postgres_changes on the requests table.
- Timers are server-authoritative. expires_at and holding_expires_at are set by the database. Clients only count down from server-provided timestamps — no client-side timer logic.
- All backend logic stays in Supabase. No separate API server.
- Service role only for status transitions. RLS prevents clients from writing status directly.

### Diner App — Navigation and Layout Principles
- No bottom navigation bar. Conflicts with the expandable bottom venue sheet.
- Top navigation only: location selector (left), Whatspot logo (center), Spots heart + profile (right).
- Map-first layout with expandable bottom venue tray — already live. Do not redesign this.
- Requests system is an overlay, not a section. Modelled after Uber ride state / DoorDash active orders.

### Diner App — Existing Surfaces (Already Live — Do Not Redesign)
- Map view with venue pins
- Expandable bottom sheet with venue list
- Venue cards
- Search (direct lookup + intent/attribute)
- Category filter pills
- Heart/save icon in top nav

### Diner App — New Surfaces to Build
- Walk-In filter pill — single addition to existing pill row. Filters to is_available = true. The only new pill; do not add party size or time pills.
- Venue card updates — availability dot, "Accepting walk-in requests now," "Usually responds in ~X min" (only when avg_response_sec is not null), "Request Walk-In" CTA button.
- Request Modal — half-sheet from venue card CTA. Party size stepper, optional note, submit. Under 10 seconds to complete.
- Floating Active Requests pill — bottom-right, above venue tray. Pulse animation on status change. Tap opens Requests Overlay. Suppresses tap target (not visibility) during tray drag; repositions only when tray settles at a snap point.
- Requests Overlay — slides up from bottom. Active / Past tabs. Active cards: venue image, name, distance, status, countdown timer (from server expires_at), Cancel button (pending only). Past cards: status badge, date, party size.

### Venue Portal — Surfaces to Build
- Incoming request alert: full-screen modal, audible notification, countdown, Accept / Decline + optional comment
- Active requests queue: pending + accepted requests, holding window countdowns
- Availability toggle: sets is_available on the venue
- Settings: acceptance window, holding window, capacity, party size limits, SMS fallback number, operating hours

### avg_response_sec Logic
Computed on the venues table. Updated by on_request_accepted trigger on every acceptance.
- avg_response_sec is null → show nothing (no placeholder text)
- avg_response_sec is not null → "Usually responds in ~X min" where X = Math.round(avg_response_sec / 60), minimum 1

### Notifications

**Diner channels:**
- Request accepted → Push + in-app
- Request declined (with comment if provided) → Push + in-app
- Request expired → Push + in-app
- Holding window expiring (5 min remaining) → Push + in-app
- Competing request auto-cancelled → In-app only

**Venue channels:**
- New request received → In-portal full-screen alert + SMS fallback
- Diner cancels pending request → In-portal
- Holding window expiring → In-portal + SMS

SMS for diners is opt-in only. Accepted and 5-min holding warning events only — not all events.

### Key Constraints
- Never fabricate the response time estimate. If avg_response_sec is null, show nothing.
- Clients never set timers. All time values come from the server. Clients only count down.
- All status transitions are server-side. Clients call Edge Functions; Edge Functions write to the DB; triggers handle side effects; Realtime broadcasts the result.
- The floating pill must not fight the tray. Pill suppresses its tap target (not its visibility) during active tray drag. Bottom offset recalculates only when tray settles — not on every drag tick.
- Requests feel transient. The overlay should never feel like a dedicated section of the app.

### Build Phases Summary
- Phase 1 MVP: Track A (backend — schema, triggers, Edge Functions, Realtime), Track B (UI — walk-in filter pill, venue card updates, request modal, floating pill, requests overlay). Exit criterion: full loop end-to-end.
- Phase 2: Feed editorial collections, Spots, waitlist on expiry, venue analytics dashboard, push notifications.
- Phase 3: Native app preparation, POS integrations, push notifications.
- Phase 4: Diner deposit via Stripe, venue SaaS subscription tiers.

## Bronco System Notes
- Issues run sequentially: #170 → #171 → ... → #181
- Each session creates its own branch: jake/[issue-number]-[slug]
- Supabase migrations cannot be automated — Claude will output SQL and pause
- Stripe and Twilio are not yet configured — Claude will create stubs with env var placeholders
- Each session must update downstream issue files in bronco/issues/ with learnings before closing
