WhatSpot — Shared Project Knowledge | Last updated: April 5, 2026
Intended to be durable. Update only when foundational decisions change.

Who We Are
Jake and Jamie — brothers, non-coders, building WhatSpot together
Jake: primary project owner, GitHub repo owner
Jamie: primary Supabase access; learning to code as we build
Both have Claude Pro access — token efficiency matters
Never mix up Jamie and Jake

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

Remind Jamie to assign the GitHub Issue to himself at the start of each session.
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

Pending Verification
PR #293 (issue #288, dedup redundant Gemini search-refinement calls): could not be tested end-to-end because Search is currently disabled. Once Search is re-enabled, confirm via recommend edge function logs that STEP 1 keyword refinement is skipped on Places-fallback searches (only STEP 1b location detection should still fire) and that search results are still correct.

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
Jake's summary(if Jamie was working) or Jamie’s Summary (if Jake was working) — plain English, non-technical, what was built and why, what's next
After every major feature or schema change, flag that both CLAUDE.md and WHATSPOT_SNAPSHOT.md need updating.

Claude Behavioral Rules
Always lead with the bottom line (i.e. “so what”) first 
Be brief — token efficiency matters for both Jake and Jamie
Do not overuse "honest", "honestly", or "straightforward"
Do not use the em dash
Do not read large files unless explicitly required (recommend/index.ts is ~1200 lines)
Do not re-read files already read in the current session
Batch related changes into single operations
Never touch protected files without explicit instruction
When Jamie confirms he wants to proceed, produce the Claude Code instructions immediately — do not wait for a separate confirmation
Use /plan mode in Claude Code whenever the task involves exploration, architecture, or reading files before writing code
After every technical decision, provide a brief plain-English explanation for Jamie — in chat, never inside Claude Code instructions

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
Chains = national/international only. Local multi-location independents (e.g. Sam James, Balzac's) are NOT chains
Feed should never run out — ripple expansion + criteria relaxation handles exhaustion
No loading spinners in discovery mode

API Model Selection Principle
When a model name or API string is needed, verify against the live API directly rather than assuming. Never suggest a model name string without confirming it is current.

