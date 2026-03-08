

## Implement Venue Scoring Algorithm

The full scoring and ranking algorithm from the old Base44 backend will be reimplemented as a single backend function (edge function) that orchestrates the entire pipeline. This keeps LLM calls and API keys server-side.

### Architecture

One new edge function `recommend` handles the full pipeline. The frontend `src/services/api.js` becomes a thin client that calls it.

```text
Frontend (Home.jsx)
  └─ src/services/api.js  ← thin wrapper, calls supabase.functions.invoke('recommend', ...)
       └─ supabase/functions/recommend/index.ts  ← NEW: full algorithm
            ├─ Step 1: LLM query refinement (Lovable AI gateway)
            ├─ Step 2: Google Places broad search (fetch to Google API directly)
            ├─ Step 3: Filter + admission tagging
            ├─ Step 4: Score with fixed constants + sort
            ├─ Step 4b: LLM intent re-ranking (Lovable AI gateway)
            ├─ Step 5: Photo enrichment (Google Places API)
            ├─ Step 6: LLM descriptor generation (Lovable AI gateway)
            └─ Suggested chips generation (Lovable AI gateway)
```

### Changes

**1. New edge function: `supabase/functions/recommend/index.ts`**

Ports the entire algorithm from the provided code. Key adaptations:
- `base44.integrations.Core.InvokeLLM` → Lovable AI gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) using `LOVABLE_API_KEY`. Uses tool calling for structured JSON responses (confidence scores, descriptors, chips).
- `base44.functions.invoke('googlePlacesBroadSearch')` → Direct Google Places API call (same logic as existing `google-places-broad-search` edge function, inlined to avoid function-to-function calls).
- `base44.functions.invoke('getPlacePhotos')` → Direct Google Places photos API call (same logic as existing `get-place-photos` edge function, inlined).
- All scoring constants (`SCORING`), `calculateVenueScore`, `calculateDistance`, `isSimpleQuery`, admission/relaxation logic ported verbatim.
- LLM model: `google/gemini-2.5-flash` for all LLM calls (fast, cost-effective for classification/ranking tasks).
- Handles CORS, returns the same response shape the frontend expects.

**2. Rewrite `src/services/api.js`**

Replace mock implementation with:
```js
import { supabase } from '@/integrations/supabase/client';

export async function recommend(params) {
  const { data, error } = await supabase.functions.invoke('recommend', { body: params });
  if (error) throw error;
  return data;
}

export async function recommendPage() {
  return { results: [], pagination: { has_more: false } };
}
```

**3. Update `supabase/config.toml`**

Add the new function:
```toml
[functions.recommend]
verify_jwt = false
```

**4. Update `src/pages/Home.jsx`**

Add `mode` parameter to the `recommend` call — pass `state.category ? 'browse_category' : 'query'` and `category: state.category` so the edge function knows which search mode to use. Also pass `radius_km` from filters.

### Algorithm fidelity

Every step from the provided code is preserved:
- Fixed `SCORING` constants (immutable across relaxation levels)
- 4-tier relaxation admission thresholds
- `isRelaxedAdmission` tagging and 0.85 penalty
- `isSimpleQuery` check to skip LLM re-ranking
- Batched LLM intent confidence (batches of 5, threshold 0.6, target 5 venues)
- Photo enrichment with concurrency limit of 3
- Descriptor generation with generic term filtering
- `place_id` and `isRelaxedAdmission` stripped before return

### Secrets required

All already configured: `GOOGLE_PLACES_API_KEY`, `LOVABLE_API_KEY`.

