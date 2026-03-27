# WhatSpot — Claude Code Context

## What This App Is
AI-powered local venue discovery app (Toronto-first). Replicates the 2-hour research process of tab-switching between Google, Reddit, critics, social. Conversational search + multi-source consensus scoring. Feels like a recommendation from a credible local friend. Not an aggregator.

---

## Who We Are
- **Jamie** and **Jake** (brothers) — non-coders building with Lovable + Claude
- Jake is primary project owner; both have Lovable and Claude Pro access
- Jamie is learning to code as we build — use plain English explanations after technical decisions
- Token efficiency matters: be brief, parallelize prompts and deployments where possible
- Never mix up Jamie and Jake

---

## Stack
- **Frontend:** React/Vite built in Lovable, deployed on Vercel
- **Database:** Supabase — project ref `rtihqiogvamfaqitmowx`
- **Maps:** Leaflet + CartoDB Voyager tiles (Mapbox migration pending)
- **LLM:** Gemini — `gemini-2.0-flash` for simple calls, `gemini-2.5-pro` for complex calls
- **Version control:** GitHub (whatspot repo)
- **Mobile:** PWA first, Capacitor wrap planned

---

## Environment
- Supabase secrets: `GOOGLE_PLACES_API_KEY`, `GEMINI_API_KEY`, `TICKETMASTER_API_KEY`
- Local dev: `npm run dev` → localhost:8080
- Deploy edge functions: `SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy <name> --no-verify-jwt --project-ref rtihqiogvamfaqitmowx`

---

## Protected Files — Never touch without explicit instruction
- `src/components/discovery/DiscoveryDeck.jsx`
- `src/components/discovery/DiscoveryCard.jsx`
- `src/components/discovery/ConstellationsSheet.jsx`
- `src/hooks/useDiscoveryInteractions.js`
- `src/hooks/useDiscoveryFeed.js` (touch only when explicitly required)
- `src/pages/Home.jsx` (touch only when explicitly required)
- `src/pages/Spots.jsx` (touch only when explicitly required)

---

## Edge Functions (11 total)
All deployed to project `rtihqiogvamfaqitmowx` with `verify_jwt=false`.

| Function | Purpose |
|----------|---------|
| `recommend/index.ts` | Main search/discovery engine (~1200 lines) — avoid reading unnecessarily |
| `get-place-photos` | Fetch Google Places photos |
| `geocode-address` | Address → lat/lon |
| `search-location` | Location search |
| `google-places-broad-search` | Broad Places text search |
| `google-places-details` | Place detail fetch |
| `search-google-place` | Single place lookup |
| `generate-refinement-chips` | LLM-generated search refinement chips |
| `venue-ai-insights` | Gemini review summary + recommended items |
| `generate-spots-tags` | Tags from user_venue_interactions |
| `aggregate-venue-signals` | Daily pg_cron 3am aggregation |

---

## Recommend Pipeline
| Step | Action |
|------|--------|
| 1 + 1b | Query refinement + neighbourhood geocoding (parallel) — `gemini-2.0-flash` |
| 1c | Refinement intent detection (skipped if no session) — `gemini-2.0-flash` |
| 2 | Google Places broad search — discovery runs tiled multi-query (5 tiles × 3 queries) |
| 3 | Filter: minRating, minReview, chain blocklist, FOOD_DRINK_TYPES allowlist, Steeles lat cap (43.7730), exclude_ids |
| 4 | Score: normalizedRating × (0.75 + 0.25 × trustFactor) |
| LLM | Discovery: descriptors + chips (`gemini-2.5-pro`). Search: confidence scoring + descriptors + summary + chips (`gemini-2.5-pro`, maxOutputTokens: 1500) |
| 5 | Photo enrichment — primary venues (4 photos) + reserve venues (3 photos, parallel) |

---

## Database Tables
| Table | Purpose |
|-------|---------|
| `user_venue_interactions` | Source of truth for all swipe interactions |
| `user_events` | Append-only analytics log |
| `venue_signals` | Venue-level aggregates (save/interested/liked/loved counts) |
| `venues` | Google Places venue data, google_place_id as PK |
| `user_profiles` | Auth profiles, includes discovery_anchor_index, discovery_last_radius_km, discovery_last_criteria_pass |
| `constellations` | Named venue sets |
| `constellation_validations` | Credibility propagation |
| `search_history` | Query history |
| `favorites` | DEPRECATED — archived, no new writes |

## Interaction → Spots Mapping
| Gesture | interaction_type | rating | Spots Tab |
|---------|-----------------|--------|-----------|
| Swipe right | interested | null | Interested |
| Swipe left | not_interested | null | Not Interested |
| Swipe up → 👎 | rated | disliked | Didn't Like It |
| Swipe up → 👍 | rated | liked | Liked It |
| Swipe up → 👍👍 | rated | loved | Favourites |

---

## Key Frontend Files
- `src/pages/Home.jsx` — discovery feed, imports logEvent, useDiscoveryFeed
- `src/components/discovery/DiscoveryDeck.jsx` — 4-way swipe, overlays, proactive load trigger
- `src/components/discovery/DiscoveryCard.jsx` — full-bleed photo card
- `src/components/discovery/ConstellationsSheet.jsx` — rating bottom sheet
- `src/hooks/useDiscoveryInteractions.js` — all 4 swipe handlers, writes to exclusion list
- `src/hooks/useDiscoveryFeed.js` — feed fetching, ripple ring system, prefetchNextBatch, anchor rotation
- `src/pages/Spots.jsx` — 5 filter tabs reading from user_venue_interactions
- `src/lib/logEvent.js` — passive event logging (null user_id for anonymous)
- `src/lib/identity.js` — getAnonId() localStorage, getSessionId() sessionStorage

## SessionStorage Keys
| Key | Purpose |
|-----|---------|
| `whatspot_seen_venues` | Capped at 100 IDs, passed as exclude_ids |
| `whatspot_skipped_venues` | Cleared on mount, all 4 interactions write here |
| `whatspot_session_history` | Last 20 searches, passed as session_context |
| `whatspot_session_id` | Session identifier |
| `whatspot_anchor_index` | Guest anchor point index |

---

## Discovery Mode Architecture
- Returns 12 primary + 10 reserve = 22 venues per request
- Criteria pass ladder (7 passes: minRating 4.0→0, minReviews 25→1, score 1.0→0.3)
- Radius rings: [2, 4, 6, 8, 10, 12] km — ripple expands before criteria relaxes
- Chain blocklist: 60+ national chains excluded in discovery only
- FOOD_DRINK_TYPES allowlist: venues must have at least one food/drink type
- Northern boundary: lat > 43.7730 excluded (Steeles Ave)
- Auto-prefetch fires immediately after initial fetch completes
- No loading spinners in discovery mode

## Anchor Point System
- 9 Toronto points: center (43.6532, -79.3832) + 8 cardinal/intercardinal at 1km
- Auth users: sequential rotation via user_profiles.discovery_anchor_index
- Guest users: random anchor stored in sessionStorage (whatspot_anchor_index)

---

## Product Vision & Rules
- Local discovery tool — not an aggregator
- Discovery feels like a recommendation from a credible local friend
- Chains surfaced only as last resort in discovery (pass 7) or via direct search
- Chains = national/international only. Local multi-location (Sam James, Balzac's) are NOT chains
- Discovery and search mode are strictly separated — discovery filters never apply to search
- Feed should never run out — ripple + criteria relaxation handles exhaustion

## Data Philosophy
- Store everything in Supabase — no localStorage for user data
- Anonymous users get sessionStorage only
- All interactions logged to user_events (append-only)
- user_venue_interactions is source of truth for interaction state

---

## Code Style
- All new hooks follow existing patterns in `useDiscoveryFeed.js`
- Discovery mode changes never affect search mode and vice versa
- sessionStorage operations always wrapped in try/catch
- Never set `isLoading: true` in prefetch functions — prefetch must be silent
- `useRef` for values that don't need re-render, `useState` for values that do

---

## Claude Behavioral Rules
- Be brief — token efficiency matters
- Do not read large files unless explicitly required (`recommend/index.ts` is ~1200 lines)
- Do not re-read files already read in this session
- Batch related changes into single operations
- Never touch protected files without explicit instruction
- Do not overuse "honest", "honestly", or "straightforward"
- When Jamie confirms he wants to proceed, write the Lovable prompt immediately — do not wait for a separate confirmation message
- Explain code concepts in plain English for Jamie's learning (brief paragraph after the action, not inside prompts)
- After every major feature or schema change, flag that the project map or tech stack section of this file needs updating

## Session Workflow
1. **Start of session:** State plan — tasks, files to be touched, expected outcome of each change
2. **End of session:** Produce two documents:
   - Full session log — every change made, confirmed working or not, any regressions
   - Jake's summary — plain English, non-technical, what was built and why, what's next
3. After major feature: note that this CLAUDE.md needs updating

---

## Lovable Workflow
Every Lovable prompt must open with:
```
GOAL: [what we are trying to achieve]
PROBLEM: [what is currently broken or missing]
```

Before deploying any prompt:
1. Ask Lovable to list every file it intends to modify
2. If the list includes a protected file not in the prompt, stop and clarify
3. For bug fixes, ask Lovable to confirm it can see the specific lines being changed

**Regression pattern:** Lovable frequently reports success without implementing changes — paste current file contents to verify when in doubt.

**Service worker / cache:** If Lovable preview shows old layout after deploy: DevTools → Application → Service Workers → Unregister → hard refresh.
