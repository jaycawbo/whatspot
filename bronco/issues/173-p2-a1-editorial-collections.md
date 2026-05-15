# Issue #173 — Phase 2: A-1 - Feed Editorial Collections
GitHub: https://github.com/jaycawbo/whatspot/issues/173

## Git Setup
Run these before implementing:
```
git checkout main
git pull origin main
git checkout -b jake/173-p2-a1-editorial-collections
git push origin jake/173-p2-a1-editorial-collections
```

## Prior Learnings from Upstream Issues
<!-- Populated by session #170 (Request Modal) — compact venue cards share the "Request Walk-In" CTA -->


## YOUR PROMPT
You are working on Whatspot, a React + Supabase app. Review the existing feed/home screen implementation before building this.

Add editorial collection rows to the feed surface.

---

DATA MODEL

Create a new Supabase table: collections

  id: uuid primary key
  title: text not null          -- e.g. "Best for right now"
  subtitle: text
  sort_order: integer
  is_active: boolean default true
  venue_ids: uuid[]             -- ordered list of featured venues

Add RLS: SELECT public, all writes service role only.

---

UI: Horizontal scroll rows

On the feed/home screen, below the category pills and above (or interspersed with) the main venue list:

  Render one horizontal scroll row per active collection.

Each row:
  - Section title (bold, left-aligned)
  - Horizontal scroll of venue cards (compact variant — square image, name, availability dot, distance)
  - Tapping a card opens the venue page
  - "Request Walk-In" should be accessible from the compact card without navigating to venue page — add a small CTA button on the card

---

QUERIES

Fetch collections on feed mount. Join to venues to get full venue objects for venue_ids.

Filter joined venues by is_available = true so stale unavailable venues don't appear in "Best for right now."

---

ADMIN NOTE

Collections are managed via the Supabase dashboard (no CMS UI needed in Phase 2). Document the table structure in a README comment.


## Supabase Migration Required
Claude will output SQL for the `collections` table. You must run it in the Supabase dashboard
before Claude can continue with the frontend implementation.

## Completion Steps
After implementing:
1. `git add .`
2. `git commit -m "Add editorial collections with horizontal scroll rows on feed"`
3. `git push origin jake/173-p2-a1-editorial-collections`
4. `gh pr create --title "Project Bronco - Phase 2: A-1 - Feed Editorial Collections" --body "Implements editorial collections table and feed UI. Closes #173." --assignee jaycawbo --label enhancement --repo jaycawbo/whatspot`

## Downstream Update Instructions
IMPORTANT: Before finishing, update the files below with learnings from this session.

Files to update:
- bronco/issues/174-p2-a2-spots.md (spots may share the compact venue card variant built here)
