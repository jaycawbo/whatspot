

# Updated VenueDetails Plan — Adding AI-Powered "What People Say" and "What to Order" Sections

## What's New

Two lazy-loaded sections at the bottom of the VenueDetails page, triggered when the user scrolls them into view:

1. **What People Say** — AI summary of Google reviews covering food, atmosphere, service, and value
2. **What to Order** — AI-generated bullet list of 1-5 recommended items

Both sections use an Intersection Observer to trigger a single edge function call only when scrolled into view. They show skeleton placeholders until loaded.

## Architecture

```text
┌─────────────────────────────────┐
│  ... existing VenueDetails ...  │
│  (carousel, info, map, reviews) │
├─────────────────────────────────┤
│  ── scroll trigger ──           │  IntersectionObserver fires here
│                                 │
│  💬 What People Say             │  AI summary paragraph
│  "Known for its warm            │
│   atmosphere and creative       │
│   cocktails. Service is         │
│   consistently praised..."      │
├─────────────────────────────────┤
│  🍽️ What to Order               │  AI bullet list (1-5 items)
│  • Truffle pasta                │
│  • Espresso martini             │
│  • Burrata appetizer            │
└─────────────────────────────────┘
```

## New Edge Function: `venue-ai-insights`

A single edge function that accepts `place_id`, `venue_name`, and `reviews` (the review texts already fetched by `google-places-details`). It calls the Lovable AI Gateway (`google/gemini-3-flash-preview`) with a prompt that returns structured output via tool calling:

- `review_summary`: 2-3 sentence paragraph covering food, atmosphere, service, value
- `recommended_items`: array of 1-5 strings (dish/drink names)

This avoids a second Google API call — the reviews are passed from the client after the details fetch completes.

### Files

- **Create** `supabase/functions/venue-ai-insights/index.ts` — edge function with CORS, LOVABLE_API_KEY auth, tool-calling for structured output
- **Update** `supabase/config.toml` — add `[functions.venue-ai-insights]` with `verify_jwt = false`

## Frontend Integration

In `VenueDetails.jsx`, after the reviews/map section:

- A `ref` element observed by `IntersectionObserver`
- When visible + details already loaded (reviews available), call `supabase.functions.invoke('venue-ai-insights', { body: { place_id, venue_name, reviews } })`
- Show Skeleton placeholders while loading, then render the two sections
- If reviews are empty or the call fails, hide the sections gracefully

## Files Summary

| Action | File |
|--------|------|
| Create | `supabase/functions/venue-ai-insights/index.ts` |
| Modify | `supabase/config.toml` (add function entry) |
| Modify | `src/pages/VenueDetails.jsx` (add two lazy sections — this file will be created as part of the base VenueDetails implementation from the prior plan) |

This is an additive change layered on top of the previously approved VenueDetails plan. All prior plan items (carousel, map, heart button, progressive details fetch, shareable URL) remain unchanged.

