# Issue #171 — Phase 1: B-3 - Floating Active Requests Pill
GitHub: https://github.com/jaycawbo/whatspot/issues/171

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/171-b3-floating-pill
git push origin jake/171-b3-floating-pill
```

## Prior Learnings from Upstream Issues

From #170 (Request Modal):
- **BroncoContext** (`src/context/BroncoContext.jsx`) is the shared state layer for all Bronco UI.
  - `openRequestModal(venue)` / `closeRequestModal()` — modal state
  - `openOverlay()` / `closeOverlay()` / `overlayOpen` — overlay state (already wired; your pill should call `openOverlay()` on tap)
  - `useBronco()` hook — import from `@/context/BroncoContext`
- **RequestModal** (`src/components/bronco/RequestModal.jsx`) calls `openOverlay()` on successful request submission. Your floating pill appears when the diner has active requests (use `useDinerRequests` from `@/hooks/useRequestRealtime`); it does NOT need to track modal success directly.
- **RequestModal** submits to the `create-request` Edge Function via `supabase.functions.invoke('create-request', { body: { venue_id, party_size, note } })`.
- Venue card "Request Walk-In" button calls `openRequestModal(venue)` from `useBronco()`.
- The floating pill should tap `openOverlay()` from `useBronco()` — the overlay open state already lives in BroncoContext.
- **Note column migration**: if Phase 1A schema did not include `note text` on the `requests` table, run: `ALTER TABLE requests ADD COLUMN IF NOT EXISTS note text CHECK (char_length(note) <= 140);`


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Build a fixed-position bottom-right pill that appears after the first request is submitted. Displays live active request count. Suppresses tap target (not visibility) during active venue tray drag gestures. Recalculates bottom offset only when tray settles at a snap point. Single pulse animation on status change. Opens Requests Overlay on tap.


## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add floating active requests pill with live count and gesture suppression"`
3. `git push origin jake/171-b3-floating-pill`
4. `gh pr create --title "Project Bronco - Phase 1: B-3 - Floating Active Requests Pill" --body "Implements floating pill UI. Closes #171." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/172-b4-requests-overlay.md (pill opens the overlay — document the trigger interface)
