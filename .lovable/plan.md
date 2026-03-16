
What I found

- I tested the live preview end-to-end with “best restaurants nearby”.
- The loading copy is working: it appears under the search bar while the search is in progress.
- The conversational summary is also working: once results return, a structured intro + bullet list renders above the venue cards.
- Backend logs confirm the response is still generating `search_summary` successfully (`STEP 7: Summary generated`).
- The search request is very slow right now: the live `recommend` call took about 42.5 seconds. That makes the feature feel broken even when it eventually works.
- There is also a repo structure risk: the live app uses `index.html -> src/main.jsx -> src/App.jsx -> src/pages/Home.jsx`, while `src/main.tsx`, `src/App.tsx`, and `src/pages/Index.tsx` are unused starter files. That makes it easy for future edits to land in the wrong files and look “undone”.

Likely cause

- This does not look like the two features were removed from the active codepath.
- The real issues are:
  1. very long search latency, which makes the summary feel missing,
  2. duplicate app entrypoints / dead starter files, which makes future edits easy to misapply,
  3. one small continuity gap: the frontend is not currently storing `search_summary` inside session history, even though the backend is prepared to use it.

Implementation plan

1. Clean up the runtime path
- Remove or quarantine the unused TypeScript starter app files so there is only one obvious live app path.
- This prevents future edits from being made in dead files.

2. Harden the loading-state UX
- Keep `LoadingMessages` tied to the active search lifecycle exactly as it is now.
- Add a secondary long-wait state after ~10–15 seconds, so slow searches explicitly say the app is still working rather than feeling stalled.
- Make sure the loading message remains visually anchored and noticeable during the full request.

3. Tighten summary state handling
- Keep the current `search_summary -> state.searchSummary -> SearchSummary` wiring.
- Clear stale summaries consistently when a new search starts or when search is cleared.
- Preserve the current bullet-format rendering.

4. Restore full session continuity
- Add `search_summary` to each `whatspot_session_history` entry in `Home.jsx`.
- That lets follow-up searches use the previous conversational explanation as intended by the backend prompts.

5. Re-test the exact flow
- Landing page search: confirm loading message appears immediately.
- Wait for completion: confirm conversational summary appears above results in bullet form.
- Run a follow-up query: confirm session context includes the prior summary.
- Confirm no regressions in logo/header state while searching.

Technical details

- Active files to update:
  - `src/pages/Home.jsx`
  - `src/context/GlobalStateContext.jsx`
  - possibly `src/components/home/SearchSummary.jsx`
- Cleanup targets:
  - `src/main.tsx`
  - `src/App.tsx`
  - `src/pages/Index.tsx`
- No database changes are needed.
- No backend schema changes are needed.
- The backend search pipeline is already returning the summary correctly; this is mainly a frontend hardening + project-structure cleanup pass.
