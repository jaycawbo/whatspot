WhatSpot — Shared Project Knowledge | Last updated: October 1, 2026
Intended to be durable. Update only when foundational decisions change.

Who We Are
Jake and Jamie are non-technical builders working together on this.
Jake: project owner, GitHub repo owner, Supabase access. Currently solo-managing the project, front end and back end.
Claude Pro access — token efficiency matters

What WhatSpot Is
One-sentence pitch: Discover, organize and share 
Discover places you didn't know about locally or abroad.
Organize everywhere you've been and want to go.
Share; see where friends have been and easily inform them on where they ought to go next.
Three pillars, one system. Never evaluate them separately.
Feed — ambient swipe feed (think Bumble and Tinder-like interaction) to aid passive venue discovery - no prompt required
Search - Search is a lightweight utility to aid user discovery when there is a more specific desired outcome for a given context (eg. “Italian restaurants suitable for large groups”) 
Spots — personal venue OS (interested, visited, loved, didn't like) with ability to search and filter Spots, as well as share these with with other users / friends  

Product Strategy (locked — do not contradict)
Feed & Search drive discovery are complemented by Spots, which helps to organize venues of interest. Never evaluate these components independently.
A low-friction and high-engagement Feed experience will drive user interactions that inform the system’s underlying algorithm for future Feed and Search results - providing ever-improving, personalized results 
Additionally, Spots passively helps users organize venues of interest that they can come back to later. This solves the clunkiness of Google Maps and Beli's cold start problem simultaneously.
Within Spots, users can discover curated imported “spot hops” that guide them through tours of various venues. Search demotion does not affect them.
Monetization:
Guest access with limited number of searches and swipes 
Monthly subscription for a fee will provide access to premium features such as the “spot hops” 

Tech Stack (high-level)
Frontend: React/Vite, deployed on Vercel
Database: Supabase
Maps: Leaflet + CartoDB Voyager tiles
LLM: Gemini (fast model for simple calls, capable model for complex calls)
APIs: Google Places API (New)
Version control: GitHub — jaycawbo/whatspot
Mobile: PWA first, Capacitor wrap planned

Dev Environment
Both Jake and Jamie run Claude Code by typing claude in the VS Code integrated terminal (PowerShell)
App runs locally via npm run dev
Deployment target: Vercel (production)
New git worktrees don't carry .env (it's gitignored) — copy it in manually before running npm run dev there, or the app loads a blank white screen ("supabaseUrl is required")

Tool Roles
Claude Code: PRIMARY tool for all code edits, file changes, and deployments
Claude.ai: Planning, architecture, diagnosis, and drafting instructions only
The moment a code fix is identified in Claude.ai, hand off to Claude Code — do not attempt manual edits in chat
Lovable: No longer the primary build platform

Git Workflow
Branch Rules
Neither Jake nor Jamie ever works directly on main
Jake's branches: jake/[issue-number]-feature-name
Jamie's branches: jamie/[issue-number]-feature-name
Branch off main at the start of every session
Merge into main only via Pull Request on GitHub — never merge locally
Every branch name must include the GitHub Issue number
Starting a Session
git checkout main
git pull origin main
git checkout -b [prefix]/[issue-number]-feature-name
git push origin [branch-name]

Assign the GitHub Issue to whoever is working at the start of each session.
Ending a Session
git add .
git commit -m "your commit message"
git push origin [branch-name]

Then open a Pull Request on GitHub to merge into main.
Commit Message Format
One-line summary (imperative tense, max 72 chars)
- Specific change 1
- Specific change 2
- Specific change 3

Rules: imperative tense ("Fix bug" not "Fixed bug"). No vague messages ("misc fixes", "wip", "updates").
Conflict Prevention
Always pull from main before creating a branch
Check the other person's active branch on GitHub before touching shared files
Protected files are especially risky — confirm before touching if the other person's branch shows recent changes to one
When in doubt: coordinate before starting
GitHub Issues
Every build order item has a corresponding GitHub Issue
Issues are assigned to whoever owns the task
Branch names always include the Issue number
Issues close automatically when the linked PR merges — no manual cleanup needed

Access Gate and Waitlist (soft launch, issue #358; homescreen-style preview, issue #366)
The app is gated for a closed group of testers. Everyone else sees WaitlistPage (src/components/access/WaitlistPage.jsx): a static, non-live preview styled to match the real homescreen (header, search row, feed tabs, one venue card with a made-up name and a locally committed sample photo — no hooks, no live data, no paid API calls). The actual access UI (waitlist email capture, Google sign-in, invite code entry) lives in a dialog on top of it, revealed after a ~3s delay or on first tap/click, whichever comes first.
This redesign (issue #366) exists because Google's OAuth branding verification rejects a home page that is only a sign-in wall ("Your home page is behind a login page"); the preview gives reviewers and crawlers something to see without ever mounting the real app or its APIs.
Gate is client-side only: localStorage flag whatspot_access (value is the invite code, or "admin"). Clear site data or use incognito to see the visitor view, in dev and prod. No IP, device, or hosting-layer checks. It is a UX gate, not security: the Supabase anon key and edge functions stay reachable directly.
AccessGate (src/components/access/AccessGate.jsx) wraps everything in App.jsx above all providers, so visitors never mount the app or trigger paid API calls. Logic lives in src/lib/accessGate.js.
Ways in: ?invite=CODE URL param, typing a code in the dialog, or signing in (Google) with an account that is linked to a code or is an admin.
Flow: visitor enters valid code > signs in > claim_invite_code() links the account to the code (invite_codes.claimed_by). One account per code and one code per account. Later sessions on any device: sign in and get_my_access() restores access. A code claimed by a different account is refused.
Signing out clears the access flag and returns the visitor to the preview (they sign in again, or re-enter a code, to get back in).
Revocation: set invite_codes.active = false. The stored flag is re-checked once per browser session; network errors fail open.
Tables: invite_codes (no anon access), waitlist (email, referral_source, created_at; unique on lower(email)). Anon reaches them only through RPCs: redeem_invite_code, join_waitlist. Signed-in users: claim_invite_code, get_my_access.
Generating codes: npm run invite-codes -- <count> [label-prefix] [base-url] prints INSERT SQL and invite links. Paste the SQL into the Supabase SQL editor. Codes are never committed to git.
The whatspot_access flag is an access marker, not user data, so it is an allowed exception to the localStorage rule below.
Google OAuth branding (issue #366): verified and live in production. whatspot.co is a verified Domain property in Search Console; Branding homepage/privacy/terms URLs point at whatspot.co; consent screen is in production (not Testing). /privacy and /terms (src/pages/Legal.jsx) render outside the gate for this and are linked from the waitlist dialog.

For You Tab Gating (issue #360)
The personalized "For You" feed tab only exists for a user once they've shown enough breadth of activity, not just volume — a single sitting can't say what someone generally likes. Guests are never eligible.
Threshold: 10+ deliberate rows in user_venue_interactions (skips don't count) AND activity across 2+ distinct session_id values in user_events, both for that user. Logic lives in src/hooks/useForYouEligibility.js (FOR_YOU_MIN_INTERACTIONS, FOR_YOU_MIN_SESSIONS).
The server's MIN_INTERACTIONS_FOR_PERSONALIZATION (supabase/functions/_shared/buildUserAffinity.ts) is also 10 deliberate interactions, so ranking starts personalizing exactly when the tab unlocks (issue #384).
Session counting excludes passive event types (card_shown, view, photo_advanced) — ambient exposure doesn't make a session count toward eligibility.
Once eligible, a user stays eligible for the session (cached in memory, keyed by user id) so later mounts don't requery; a failed eligibility check resolves as "not eligible" (hide the tab, not a cold-start one).
Depends on user_events being populated correctly for session_id and event_type — an events-logging gap silently blocks tab eligibility rather than erroring visibly.

Discovery Feed Tabs (issues #374, #380, #381, #385, #386)
Tab bar, left to right: Popular, New, Most Liked, For You. Walk-In Friendly and Trending are hidden (hidden: true in src/components/home/FeedModeTabs.jsx) until their logic is maintained again; Walk-In never checked opening hours. Users who can't see For You land on Popular.
Popular, New and Most Liked come from the feed-tabs edge function (venues_near RPC, database only, no Google or Gemini calls). For You comes from recommend in discovery mode.
Popular: top 40 by review count, weighted shuffle to 20. Most Liked: rating 4.7+ and 100+ reviews, the whole qualifying pool shuffled (weightedShuffleTopK only reorders its first 2x limit rows, so it isn't used there). New: see New-Venue Sweep below.
Every feed tab requires a food/drink type and excludes venues whose primary (first) Google type is a hotel, place of worship, museum, gym, grocery/market, university, attraction, theatre or event/wedding venue. Nightlife activities (karaoke, bowling, arcades, comedy) stay in. Rules live in supabase/functions/_shared/venueTypes.ts (isFeedVenue, FOOD_DRINK_TYPES, EXCLUDED_PRIMARY_TYPES); feed-tabs passes the same lists to venues_near.
Filters: open now, price, cuisine, radius. The Other cuisine chip and the feed's walk-in toggle were removed. Breakfast also matches brunch_restaurant and Italian also matches pizza_restaurant (_shared/cuisineTypes.ts, mirrored in src/lib/filterOptions.js for Spots). A price filter keeps venues with no price listed, ranked at 0.7 weight, on every tab.
Open now uses the user's local day and time sent by the client (src/lib/localTime.js), not the server's UTC clock, and handles venues that close at or after midnight and 24/7 venues (_shared/openingHours.ts, with tests). Feed tabs keep venues with no stored hours, ranked at 0.7 weight (about 70% of venues have none yet; the weekly refresh fills them in); search keeps open now strict. There is no paid hours lookup during open-now requests.

Chain Flagging (issue #386)
venues.is_chain is set by the is_chain_name() SQL function through a trigger on every insert or rename, plus a one-time backfill (3,447 venues). Chains = national/international brands plus regional franchises with 10+ locations (e.g. JOEY, Osmow's, Pizza Nova, Pizzaiolo). Local multi-location independents (e.g. Sam James, Piano Piano) are not chains. To add a brand, update the pattern in is_chain_name() with a new migration and re-run the backfill UPDATE.

For You Personalization (issue #384)
Scorer: supabase/functions/_shared/buildUserAffinity.ts (tests alongside). Preferences are scored relative to the user's own like rate, so generic types every venue carries (food, restaurant, establishment) carry no signal. Loved counts 3x, skips count 0.25 as a non-like, and only each venue's top 3 Google types are used. A specific cuisine with signal (ramen) outweighs its parent (japanese). Looks back over the last 200 interactions with recency weighting. For You applies it at weight 0.35, other discovery ranking at 0.18.

New-Venue Sweep (issue #382)
New tab rule: a venue is New if it had 100 or fewer reviews when WhatSpot first saw it, for 6 months after that. A trigger sets venues.review_count_at_ingestion on every insert; created_at is the first-seen date.
Supply: the census-sweep edge function finds venues we don't have yet, designed to cost $0 using only Google free allowances. Discover: Text Search with an IDs-only field mask (free) over venue_sweep_grid (2,378 Toronto squares that have venues). Locate: Place Details Essentials (location, types) for each new ID, dropping non-feed venues. Fill: Text Search Enterprise over the squares with the most pending candidates, capped at 800 calls a month (the free allowance is about 1,000; the rest stays for the feed and search fallbacks).
Schedule (pg_cron): new-venue-sweep-quarterly runs every 15 minutes on the 1st to 3rd of Jan/Apr/Jul/Oct; new-venue-fill-daily runs at 07:00 UTC. Progress lives in venue_sweep_state and venue_sweep_candidates, so runs resume and finished quarters no-op.
Live runs require the x-sweep-secret header (edge secret SWEEP_SECRET, Vault secret sweep_secret, never in git). dry_run needs no secret and makes no Google calls.
The first run (2026-Q4) found 4,186 missing venues; fill is expected to finish around Dec 2026 to Jan 2027.

Google Places Spend Caps
Every paid Google call goes through checkAndLog() in supabase/functions/_shared/apiCallLog.ts, which blocks a call type once it hits its monthly cap. Notable caps: discovery_fallback (For You backup search) 1,500; search_fallback 5,000; weekly 10,000; photos 3,000; new_venue_text 800; new_venue_locate 9,000. Google's free allowances are per SKU per billing account; check Google Cloud Billing > Reports grouped by SKU before adding a new paid call pattern.

Instagram on Venue Detail (issue #397)
Venue detail pages show an Instagram profile button and up to 3 embedded posts, using Instagram's official blockquote + embed.js pattern. Display-only: we store a handle and post permalinks, nothing else from Instagram (no captions, images, counts). No scraping, no Graph API, and Instagram content never goes to Gemini.
Schema: venues.instagram_handle (no @, format CHECK) and venue_instagram_posts (venue_id uuid FK, permalink, shortcode, sort_order, is_active). Public read of active posts only; writes are service role (the SQL editor). Migration 20260928000000_venue_instagram.sql, applied to production Sept 29, 2026.
On/off switch: INSTAGRAM_EMBEDS_ENABLED in src/lib/featureFlags.js (a plain constant; only the Supabase URL and key use VITE_ env vars).
Validation lives in src/lib/social/instagram.js (normalizeHandle, parsePermalink); the frontend re-validates every DB value before rendering. embed.js loads once per session, only when the section nears the viewport; if it's blocked, plain "View on Instagram" links show instead.
Adding data: fill in instagram-seed.csv (gitignored; template at scripts/instagram-seed-template.csv), run npm run instagram-seed -- instagram-seed.csv --out seed.sql, and paste seed.sql into the Supabase SQL editor. One row per venue, up to 3 posts across the row. Dry run by default; the script never touches the database.
Cost: no external API cost at runtime; one small Supabase read per venue-detail open. The plan for populating existing and future venues, with cost notes, is in issue #397.
To-do: the privacy policy (src/pages/Legal.jsx) needs a line about Meta embeds.

Pending Verification
Feed changes from the #374 follow-ups (Sept 27 to Oct 1, 2026) were verified against live edge functions, but not yet clicked through in the running app: the tab order (Popular, New, Most Liked, For You), the filter sheet (no Other chip, no walk-in toggle), and toggling Open now.
Data cleanup: 33,213 venues from a May 6, 2026 import have no Google ID, rating or reviews. They never show in the feed, but the sweep may add Google-backed duplicates of some.
Correction (Sept 13, 2026): Search was never actually disabled — it's live in the user-facing UI behind a "BETA" flag. The note below previously assumed it was disabled; that premise was wrong.
PR #298 (issue #288, dedup redundant Gemini search-refinement calls): not yet confirmed via recommend edge function logs that STEP 1 keyword refinement and STEP 1b location detection are both skipped on Places-fallback searches (only 1 Gemini call — refine-query itself — should fire per search) and that search results are still correct. Since Search is live, this can be verified directly now.
PR #359 (issue #358, access gate): Google sign-in round trip with the gate (code > sign in > claim, and returning sign-in without a code) — verified working in production as of Sept 27, 2026. Stop-gap invite code 357246 (label jake-stopgap) is still in invite_codes and should be deleted once real codes are issued.

Protected Files — Never touch without explicit instruction
src/components/discovery/DiscoveryDeck.jsx
src/components/discovery/DiscoveryCard.jsx
src/components/discovery/ConstellationsSheet.jsx
src/hooks/useDiscoveryInteractions.js
src/hooks/useDiscoveryFeed.js (touch only when explicitly required)
src/pages/Home.jsx (touch only when explicitly required)
src/pages/Spots.jsx (touch only when explicitly required)
Before deploying any prompt to Claude Code:
Ask Claude Code to list every file it intends to modify
If the list includes a protected file not mentioned in the prompt, stop and clarify
For bug fixes, ask Claude Code to confirm it can see the specific lines being changed before proceeding

Prompt Format (required for every Claude Code prompt)
GOAL: [what we are trying to achieve]
PROBLEM: [what is currently broken or missing, if applicable]
[instructions]

Session Format
Start of every session
State a plan covering:
What we're tackling (task list)
Expected outcome of each change
End of every session
Produce two documents:
Full session log — every change made, confirmed working or not, any regressions
Plain-English summary — non-technical, what was built and why, what's next
After every major feature or schema change, flag that CLAUDE.md needs updating.

Claude Behavioral Rules
Always lead with the bottom line (i.e. “so what”) first 
Be brief — token efficiency matters
Do not overuse "honest", "honestly", or "straightforward"
Do not use the em dash
Do not read large files unless explicitly required (recommend/index.ts is ~1200 lines)
Do not re-read files already read in the current session
Batch related changes into single operations
Never touch protected files without explicit instruction
When the user confirms they want to proceed, produce the Claude Code instructions immediately — do not wait for a separate confirmation
Use /plan mode in Claude Code whenever the task involves exploration, architecture, or reading files before writing code
After every technical decision, provide a brief plain-English explanation — in chat, never inside Claude Code instructions

Cost Awareness (permanent rule)
Before any feature, API call pattern, or background process is designed or modified, proactively flag cost implications first. This is non-negotiable.
Specifically:
Identify every external API call the feature makes
State the cost per call
Flag any background processes, auto-triggers, or loops that could fire without explicit user action
Any process that calls Google Places API without user interaction is a billing risk
Auto-prefetch or page-load triggers that hit paid APIs = guaranteed runaway costs in testing
When flagging a cost risk, format it as:
⚠️ COST WARNING: [what the risk is]
- API affected: [which API]
- Cost per call: [price]
- Risk scenario: [what could cause runaway costs]
- Recommended safeguard: [how to prevent it]


Code Style
All new hooks follow existing patterns in useDiscoveryFeed.js
Discovery mode changes never affect search mode and vice versa
sessionStorage operations always wrapped in try/catch
Never set isLoading: true in prefetch functions — prefetch must be silent
useRef for values that don't need re-render, useState for values that do

Data Philosophy
Store everything in Supabase — no localStorage for user data
Anonymous users get sessionStorage only
All interactions logged to user_events (append-only)
user_venue_interactions is source of truth for interaction state

Discovery Mode Rules
Discovery and search mode are strictly separated
Discovery filters (chain blocklist, FOOD_DRINK_TYPES allowlist, geographic caps) never apply to search
Users can always search for chains, gyms, etc. directly
Chains = national/international brands plus regional franchises with 10+ locations. Local multi-location independents (e.g. Sam James, Balzac's) are NOT chains. See Chain Flagging above
Feed should never run out — ripple expansion + criteria relaxation handles exhaustion
No loading spinners in discovery mode

API Model Selection Principle
When a model name or API string is needed, verify against the live API directly rather than assuming. Never suggest a model name string without confirming it is current.

