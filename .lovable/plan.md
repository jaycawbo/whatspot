

## Analysis

The proposed fix (empty dependency array) is **correct and worth applying**, but it may not be the full story.

### Why the empty deps help
With `[fetchFeed, initAnchorPoint]` as deps, React recreates these callbacks whenever `state.userLocation`, `state.locationName`, or `state.filters` change. In theory `hasFetchedRef` guards against re-execution, but there's a subtle timing issue: if another effect or state update causes `fetchFeed` to get a new reference before the initial effect fires, React may defer/batch the effect, leading to a race condition where the first fetch doesn't happen reliably. Empty deps (`[]`) guarantee the effect fires exactly once on mount with zero interference.

### Possible deeper issue
The empty-state message ("you've explored all the top spots nearby") means the API returned zero results. This could also be caused by:
- **Accumulated `whatspot_seen_venues` in sessionStorage** — if the seen-venues list from prior sessions is large, `exclude_ids` could filter out everything. Worth verifying whether clearing sessionStorage fixes it independently.
- The `recommend` edge function's new `DISCOVERY_CRITERIA` pass-1 thresholds (rating ≥ 4.0, reviews ≥ 25, score ≥ 1.0) may be too strict for the initial 2km radius, returning empty results.

### Plan — single file change in `src/hooks/useDiscoveryFeed.js`

**Change 1 — Empty dependency array on mount effect (line 190)**
```
}, [fetchFeed, initAnchorPoint]);
```
→
```
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

This is the user's requested change. It ensures the effect fires exactly once on mount.

If the feed still shows empty after this fix, the next step would be to investigate whether `whatspot_seen_venues` accumulation or the strict pass-1 criteria thresholds are filtering out all results.

