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
You are working on Whatspot, a React + Supabase app. Review the existing codebase — specifically any existing modal or sheet components, the Supabase client, and auth state — before building this.

Build a Request Modal component: src/components/requests/RequestModal.tsx

---

TRIGGER

Opens when user taps "Request Walk-In" on a venue card.

Receives: venue object as a prop.

---

LAYOUT

Half-sheet / bottom sheet modal. Should feel lightweight and fast — not a full-page navigation.

Use the existing modal/sheet pattern in the codebase if one exists; otherwise build a bottom sheet that:

  - Slides up from bottom
  - Has a drag handle at the top
  - Dismissible by swipe down or tapping the backdrop

---

CONTENT

Header:
  - Venue name
  - "Request a walk-in table" subtitle

Fields:
  1. Party size selector
     - Stepper: minus / number / plus
     - Range: 1–10 (or venue's max party size if available)
     - Default: 2
  2. Optional note (single text input, max 140 chars)
     - Placeholder: "Any requests? (optional)"
     - Do not make this prominent — it is secondary

Submit button:
  - Label: "Send Request"
  - Full width, primary style
  - Disabled until party size is set (it defaults to 2, so it should be enabled by default)
  - Shows loading state while the request is submitting

---

SUBMISSION LOGIC

On submit:
  1. Call POST /functions/v1/create-request (create this Edge Function if it does not exist) with:
     { venue_id, party_size, note? }
  2. On success:
     - Close the modal
     - Trigger the floating Active Requests pill to appear (via shared state or context)
     - Show a brief confirmation toast: "Request sent — we'll notify you when they respond"
  3. On error:
     - Show inline error message
     - Do not close the modal

---

STATE

Use the existing auth context to get diner_id.

After successful submission, the new request should appear immediately in the diner's active requests list (handled by the Realtime hook from Track A — this component just needs to trigger the insert).


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
