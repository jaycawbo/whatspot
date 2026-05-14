# Issue #170 — Phase 1: B-2 - Request Modal
GitHub: https://github.com/jaycawbo/whatspot/issues/170

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/170-b2-request-modal
git push origin jake/170-b2-request-modal
```

## Prior Learnings from Upstream Issues
<!-- This section is populated automatically by upstream Claude sessions -->
<!-- If empty, no upstream issues have run yet -->


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Build a half-sheet bottom modal triggered from the venue card CTA. Fields: party size stepper (default 2) and optional note (max 140 chars). Submits to create-request Edge Function. On success: closes modal, activates floating pill, shows confirmation toast. Target interaction time under 10 seconds.


## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add walk-in request modal with party size stepper and note field"`
3. `git push origin jake/170-b2-request-modal`
4. `gh pr create --title "Project Bronco - Phase 1: B-2 - Request Modal" --body "Implements half-sheet request modal. Closes #170." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, open each file below and add a ## Upstream Learnings section
with any decisions from this implementation that will affect that issue.
Focus on: component names, prop interfaces, data shapes, hook names, Supabase table/column names.
If nothing from this issue affects a downstream file, write "No changes needed from #170."

Files to update:
- bronco/issues/171-b3-floating-pill.md (pill is activated by this modal's success callback)
- bronco/issues/172-b4-requests-overlay.md (overlay shows requests created by this modal)
- bronco/issues/173-p2-a1-editorial-collections.md (collection cards share the "Request Walk-In" CTA)
- bronco/issues/174-p2-a2-spots.md (spots venue cards may share CTA pattern)
- bronco/issues/180-p4-a1-diner-deposit.md (deposit payment sheet gets added to this modal)
