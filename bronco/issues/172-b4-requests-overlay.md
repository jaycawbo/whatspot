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
You are working on Whatspot, a React + Supabase app. Review the existing codebase — specifically existing sheet/modal patterns, the RequestsContext, and the useDinerRequests hook — before building this.

Build the Requests Overlay: src/components/requests/RequestsOverlay.tsx

---

TRIGGER

Opened by tapping the Active Requests pill. Controlled via RequestsContext (open/closed state).

---

LAYOUT

Bottom sheet that slides up. Feels transactional, not like full-page navigation.
  - Drag handle at top
  - Close button (X) top-right
  - Dismissible by swipe down

This should NOT feel like a dedicated app section. It is a lightweight status overlay.

---

HEADER

Title: "Requests"
Subtitle: "Track and manage your walk-in requests."

---

TABS

Segmented control with two tabs: Active | Past

Keep implementation simple — no filters, no sorting, no search.

---

ACTIVE TAB

Render one card per active request (status in ['pending', 'accepted']). Cards update in real-time via useDinerRequests.

Card structure:

  Header row:
    - Venue thumbnail image (small, square)
    - Venue name (bold)
    - Neighborhood or distance (secondary text)

  Status row:

    Pending:
      - Orange dot + "Pending" label
      - "Usually responds in ~X min" (from venue.avg_response_sec; omit if null)
      - Progress bar showing time remaining in acceptance window
      - Time remaining label: "2:37 remaining"
        Time is derived from request.expires_at - now(), updated every second client-side
        (expires_at comes from the server — client only counts down, never sets the timer)

    Accepted:
      - Green dot + "Accepted" label
      - Holding window countdown: "Table held for X:XX"
      - Two CTA buttons: "View Venue" | "Directions"

    Declined:
      - Red dot + "Declined"
      - Show decline_comment if present

    Expired:
      - Grey dot + "Expired"

  Action row (Pending only):
    - "Cancel Request" button — calls cancel-request Edge Function on confirm
    - Confirm before cancelling: inline confirm state on the button ("Are you sure? Tap to confirm"), not a separate modal

---

PAST TAB

Render requests with status in ['redeemed', 'cancelled', 'declined', 'expired'].
Fetched on tab switch — not preloaded. Sorted by created_at desc.

Card structure (simpler):
  - Venue thumbnail, name
  - Status badge: Accepted (green) / Declined (red) / Expired (grey) / Cancelled (grey)
  - Date + party size: "Sat, May 11 • 7:30 PM • 2 people"
  - Chevron → tapping opens venue page

---

EMPTY STATES

Active tab empty: "No active requests. Tap 'Request Walk-In' on any venue to get started."
Past tab empty: "No past requests yet."


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
