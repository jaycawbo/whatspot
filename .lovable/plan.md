

## Findings

**Tiles**: The code already uses CartoDB Voyager in all 4 map files. You mentioned wanting **CartoDB Positron** — I'll switch to that (the minimal grayscale style: `light_all` URL). Voyager is what's currently deployed and what your screenshot shows — it IS CartoDB, not default OSM.

**Dialog closing on map click**: The `onInteractOutside` and `onPointerDownOutside` props are already present and correctly forwarded by the dialog component. However, these only prevent closing when clicking the **overlay** — they don't help with Leaflet's internal event handling. The real issue is that Leaflet's map click events use `stopPropagation` in a way that interferes with Radix's focus management, causing Radix to detect a "focus outside" event and close the dialog.

The proper fix is to also add `onFocusOutside={(e) => e.preventDefault()}` to prevent Radix from closing on focus loss, AND wrap the map container div with `onPointerDown={(e) => e.stopPropagation()}` to prevent pointer events from bubbling past the map to the dialog layer.

---

## Plan

### File 1: `src/components/home/LocationMapPicker.jsx`
- Add `onFocusOutside={(e) => e.preventDefault()}` to `<DialogContent>` 
- Add `onPointerDown={e => e.stopPropagation()}` to the map wrapper `<div>` (the `flex-1 min-h-0` div around the map)

### Files 2-5: All map tile files
Switch from Voyager to **Positron** (`light_all`) in:
- `src/components/home/LocationMapContent.jsx`
- `src/components/home/MapView.jsx`
- `src/components/spots/SpotsMapView.jsx`
- `src/pages/VenueDetails.jsx`

New URL: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`

