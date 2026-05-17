# Issue #178 — Phase 3: A-1 - Native App Preparation
GitHub: https://github.com/jaycawbo/whatspot/issues/178

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/178-p3-a1-native-prep
git push origin jake/178-p3-a1-native-prep
```

## Prior Learnings from Upstream Issues

From Phase 1 B-series (#170-#172):
- **BroncoContext** (`src/context/BroncoContext.jsx`): `openRequestModal`, `closeRequestModal`, `overlayOpen`, `openOverlay`, `closeOverlay`, `isTrayDragging`, `traySnapHeightPx`, `setTrayDragging`, `setTraySnapHeight`. Mounted in `App.jsx`.
- **RequestModal**, **FloatingRequestsPill**, **RequestsOverlay** all mounted globally in `App.jsx`.
- `ResultsBottomSheet.jsx` now calls `useBronco()` for tray drag state.
- `useDinerRequests`, `useVenueRequests`, `useRequestUpdates` in `src/hooks/useRequestRealtime.js`.
- `create-request`, `cancel-request`, `accept-request`, `decline-request`, `redeem-request`, `expire-pending-requests` edge functions in `supabase/functions/`.

From Phase 2 (#173-#174):
- **useCollections** (`src/hooks/useCollections.js`), **CollectionsSection** (`src/components/bronco/CollectionsSection.jsx`), **CompactVenueCard** (inside CollectionsSection.jsx).
- **useBroncoSpotLists** (`src/hooks/useBroncoSpotLists.js`), **SpotListsSection** (`src/components/bronco/SpotListsSection.jsx`).
- All Bronco components are in `src/components/bronco/`. All Bronco hooks in `src/hooks/`.
- Web-only dependencies added: `supabase.channel()` (Realtime WebSocket), `vaul` (Drawer bottom sheet), PWA features (service worker needed for push notifications in #177).

From Phase 2 (#175-#177) — to be filled in by those sessions.


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Audit components for web-only dependencies and document in NATIVE_BLOCKERS.md. Extract all Supabase queries, Edge Function calls, and Realtime subscriptions from components into dedicated hook/service files. Document routing structure and its React Native equivalents. Consolidate environment config into a single module. Output NATIVE_READINESS.md summarising remaining work before Expo can be introduced.


## Note: This is primarily an audit and refactor issue
No new Supabase migrations are expected. Output files are NATIVE_BLOCKERS.md and NATIVE_READINESS.md.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Native app preparation: extract hooks, audit blockers, output readiness docs"`
3. `git push origin jake/178-p3-a1-native-prep`
4. `gh pr create --title "Project Bronco - Phase 3: A-1 - Native App Preparation" --body "Extracts Supabase logic into hooks and documents native blockers. Closes #178." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/179-p3-a2-pos-integration.md (note any hook extraction patterns established here that POS integration should follow)
- bronco/issues/180-p4-a1-diner-deposit.md (note same)
- bronco/issues/181-p4-a2-venue-saas.md (note same)
