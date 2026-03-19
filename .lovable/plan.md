

## Plan: Add Toronto anchor-based discovery with ring expansion to useDiscoveryFeed.js

Single file change: `src/hooks/useDiscoveryFeed.js`

### Changes

**Change 1 — Add supabase import (line 3)**
Add `import { supabase } from '@/integrations/supabase/client';` after existing imports.

**Change 2 — Add constants before hook function (before line 12)**
Insert `TORONTO_ANCHORS` (9 points), `RADIUS_RINGS` ([2,4,6,8,10,12]), and `MAX_CRITERIA_PASS` (7).

**Change 3 — Add discovery state refs (after line 22, replacing existing isPrefetchingRef on line 23)**
Add `radiusRingIndexRef`, `criteriaPassRef`, `anchorPointRef`, and keep `isPrefetchingRef`.

**Change 4 — Add initAnchorPoint function (before fetchFeed, ~line 25)**
Insert the `initAnchorPoint` useCallback that:
- Priority 1: uses live user location
- Priority 2: loads anchor index from user_profiles for authenticated users, increments for next session
- Priority 3: random anchor from sessionStorage for guests

**Change 5 — Replace prefetchNextBatch (lines 131-194)**
Replace with new version that uses ring expansion (`RADIUS_RINGS`), criteria pass advancement, anchor points, and sends `criteria_pass` to the backend.

**Change 6 — Update mount useEffect (lines 112-117)**
Change to call `initAnchorPoint().then(() => fetchFeed())` and add `initAnchorPoint` to deps.

**Change 7 — prefetchNextBatch already in return object** — no change needed there.

### Technical details
- `anchorPointRef` stores the lat/lon used for discovery API calls
- Ring expansion: radius goes 2→4→6→8→10→12km, then criteria_pass increments and rings reset
- When criteria_pass advances, seen venues are cleared so they can resurface under relaxed thresholds
- Authenticated users persist their anchor index in `user_profiles.discovery_anchor_index`
- No other files touched

