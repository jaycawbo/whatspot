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
You are working on Whatspot, a React + Supabase app. Review the existing codebase — specifically the map view layout, bottom sheet z-index and gesture handling, and any existing floating UI elements — before building this.

Build a floating Active Requests pill: src/components/requests/ActiveRequestsPill.tsx

---

BEHAVIOR

- Hidden when the diner has zero active requests (status in ['pending', 'accepted'])
- Visible as soon as one or more active requests exist
- Count updates in real-time via the useDinerRequests hook (built in Track A)

---

POSITION

- Fixed position: bottom-right
- Sits above the expandable bottom venue tray at all times
- Adjust bottom offset dynamically based on current tray height so the pill never overlaps or is obscured by the tray
- Sits within the safe area (above iPhone home indicator / Android nav bar)

---

TRAY GESTURE CONFLICT

The pill must not interfere with the tray's drag gesture.

  - Define an exclusion zone: when the tray is being actively dragged (detect via the tray's drag state), suppress the pill's tap target but keep it visually present
  - The pill should not reposition on every tray movement — only recalculate its bottom offset when the tray settles at a new snap point

---

VISUAL

- Pill shape, dark fill
- Icon: speech bubble or similar
- Label: "1 Active" / "2 Active" / "3 Active" — use count, not full word "Requests" beyond 3+ if space is tight
- Subtle pulse animation when a request status changes (new acceptance, decline, or expiry)
  - One pulse, not a persistent loop
  - CSS animation is fine

---

INTERACTION

Tapping the pill opens the Requests Overlay (built in next prompt) via shared state or context.

---

STATE MANAGEMENT

Create a RequestsContext (or extend an existing context if appropriate) that:
  - Holds active request count
  - Holds overlay open/closed state
  - Is consumed by both this pill and the Requests Overlay

Place context in src/context/RequestsContext.tsx


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
