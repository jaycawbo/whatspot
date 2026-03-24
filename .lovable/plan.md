

## Fix Anchor Point Rotation: Search Specificity + Sequencing

### Files to modify

1. `supabase/functions/geocode-address/index.ts` — return `location_type` from Google Geocoding result
2. `src/components/home/LocationSearch.jsx` — pass `isGPS`, `isPinDrop`, `locationType` through `onLocationSelect`
3. `src/components/home/LocationMapPicker.jsx` — pass `isPinDrop: true` through `onLocationSelect`
4. `src/context/GlobalStateContext.jsx` — preserve extra fields (`isGPS`, `isPinDrop`, `locationType`) in `SET_LOCATION` reducer
5. `src/hooks/useDiscoveryFeed.js` — fix sequencing, use `anchorPointRef` in `fetchFeed`, add specificity-aware `initAnchorPoint`

**None of the protected files are included** (DiscoveryDeck, DiscoveryCard, ConstellationsSheet, useDiscoveryInteractions, Spots, recommend edge function).

---

### Changes

**1. `supabase/functions/geocode-address/index.ts`**
- Extract `data.results[0].types` from the Google Geocoding response (e.g. `['locality', 'political']`, `['neighborhood', 'political']`, `['street_address']`)
- Map the first meaningful type to a `locationType` string: `locality`/`administrative_area_level_1`/`country` → `'city'`; `neighborhood`/`sublocality` → `'neighbourhood'`; `route`/`street_address` → `'street'`; default → `'other'`
- Return `locationType` alongside `lat`/`lon` in the response

**2. `src/components/home/LocationSearch.jsx`**
- `handleUseCurrentLocation` (line 72-79): add `isGPS: true, isPinDrop: false, locationType: null` to the coords object passed to `onLocationSelect`
- `selectSuggestion` (line 99-101): pass `locationType` from geocode response (`data.locationType`) into coords; set `isGPS: false, isPinDrop: false`

**3. `src/components/home/LocationMapPicker.jsx`**
- `handleConfirm` (line 31-33): add `isPinDrop: true, isGPS: false, locationType: null` to the coords object

**4. `src/context/GlobalStateContext.jsx`**
- In `SET_LOCATION` reducer case, spread all fields from `action.payload.coords` (not just `lat`/`lon`):
```js
userLocation: {
  lat: action.payload.coords?.lat ?? state.userLocation.lat,
  lon: action.payload.coords?.lon ?? state.userLocation.lon,
  isGPS: action.payload.coords?.isGPS || false,
  isPinDrop: action.payload.coords?.isPinDrop || false,
  locationType: action.payload.coords?.locationType || null,
},
```

**5. `src/hooks/useDiscoveryFeed.js`**

*Sequencing fix:*
```js
// Change from: fetchFeed → initAnchorPoint → prefetch
// To: initAnchorPoint → fetchFeed → prefetch
initAnchorPoint().then(() => {
  fetchFeed().then(() => { prefetchNextBatch(); });
});
```

*fetchFeed uses anchorPointRef:*
```js
lat: anchorPointRef.current?.lat ?? state.userLocation?.lat,
lon: anchorPointRef.current?.lon ?? state.userLocation?.lon,
```

*initAnchorPoint with specificity awareness:*
- Priority 1: `state.userLocation?.isGPS === true` or `state.userLocation?.isPinDrop === true` → use exact coords, no rotation
- Priority 2: `state.userLocation?.locationType` exists and is NOT `'city'` → use exact coords, no rotation
- Priority 3: Broad area (locationType is `'city'` or null) → apply existing rotation logic (profiled users: sequential anchor index from DB; guests: random from sessionStorage)
- Remove the old Priority 1 that always used raw userLocation (which defeated rotation entirely)

