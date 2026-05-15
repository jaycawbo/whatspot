# Issue #172 — Phase 1: B-4 - Requests Overlay
GitHub: https://github.com/jaycawbo/whatspot/issues/172

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/172-b4-requests-overlay
git push origin jake/172-b4-requests-overlay
```

## Prior Learnings from Upstream Issues
<!-- Populated by sessions #170 (Request Modal) and #171 (Floating Pill) -->
<!-- Check here before starting for hook names, data shapes, and trigger interfaces -->


## YOUR PROMPT
<!-- Jake: paste your detailed implementation prompt below -->

Build a bottom sheet overlay with Active and Past segmented tabs. Active cards: venue image, name, distance, status badge, server-derived countdown timer, Cancel button with inline confirm. Past cards: status badge, date, party size, chevron to venue page. Powered by useDinerRequests hook with live Realtime updates.


## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add requests overlay with active/past tabs and Realtime updates"`
3. `git push origin jake/172-b4-requests-overlay`
4. `gh pr create --title "Project Bronco - Phase 1: B-4 - Requests Overlay" --body "Implements requests overlay powered by useDinerRequests. Closes #172." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/175-p2-a3-waitlist.md (waitlist prompt replaces expired card state in this overlay)
- bronco/issues/177-p2-b1-push-notifications.md (push notifications trigger on request status changes shown in this overlay)
