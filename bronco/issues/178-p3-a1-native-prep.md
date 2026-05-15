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
<!-- Populated by all Phase 1 and Phase 2 sessions -->
<!-- Check here for a full picture of web-only dependencies introduced across the project -->


## YOUR PROMPT
You are working on Whatspot, a React + Supabase app. Review the existing PWA structure, routing, component library, and Supabase client setup before beginning.

Prepare the diner app for React Native / Expo without breaking the existing PWA.

---

GOAL

Establish a shared logic layer between the web PWA and a future React Native app.

Do not build the native app yet — build the foundation that makes it achievable without a rewrite.

---

STEPS

1. Audit components

   Identify which components are web-only (use DOM APIs, CSS-only animations, web-specific libraries).

   Document these in a file: NATIVE_BLOCKERS.md

   For each blocker, note the recommended React Native equivalent.

2. Extract business logic

   Move all Supabase queries, Edge Function calls, and Realtime subscriptions out of components and into dedicated hook/service files if not already done.

   Components should call hooks; hooks should call Supabase.

   This is the primary prerequisite for native reuse.

3. Identify navigation

   Document the current routing structure.

   Note which routes map cleanly to React Native screens and which do not.

4. Environment config

   Ensure all environment variables (Supabase URL, anon key) are accessed via a single config module, not scattered imports.

Output: updated hooks/services, NATIVE_BLOCKERS.md, and a brief NATIVE_READINESS.md summarising what remains before Expo can be introduced.


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
