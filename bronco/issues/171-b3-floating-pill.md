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
<!-- Populated by session #170 (Request Modal) -->
<!-- Check here before starting for component names, hook names, and data shapes from B-2 -->


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
