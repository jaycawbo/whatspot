

## Two Issues with the Map Experience

### Issue 1: Dialog closes when tapping the map to pin

**Root cause:** The Radix `DialogOverlay` listens for pointer-down events outside `DialogContent` to close the dialog. Leaflet's map click events bubble up and Radix interprets them as "interact outside" events, triggering `onOpenChange(false)`. This is a well-known Radix + Leaflet conflict.

**Fix:** Add `onInteractOutside={(e) => e.preventDefault()}` to `DialogContent` in `LocationMapPicker.jsx`. This tells Radix to ignore pointer events inside the dialog content area, allowing map clicks to work normally.

Additionally, add `onPointerDownOutside={(e) => e.preventDefault()}` as a belt-and-suspenders measure.

**File:** `src/components/home/LocationMapPicker.jsx` — add two props to `<DialogContent>`.

---

### Issue 2: Map tile aesthetic

The current tiles use the default OpenStreetMap raster style (`tile.openstreetmap.org`), which looks utilitarian. Here are free alternatives with better aesthetics:

| Option | Look | URL |
|--------|------|-----|
| **CartoDB Voyager** | Clean, modern, muted colors — great for app UIs | `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png` |
| **CartoDB Positron** | Minimal grayscale — lets UI elements pop | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` |
| **Stadia Alidade Smooth** | Soft pastel — polished feel | Requires API key |

**Recommendation:** CartoDB Voyager — free, no API key, modern look that fits a consumer app. Apply across all 4 map components (LocationMapContent, MapView, SpotsMapView, VenueDetails).

---

### Changes

**`src/components/home/LocationMapPicker.jsx`**
- Add `onInteractOutside` and `onPointerDownOutside` with `e.preventDefault()` to `<DialogContent>` to stop the dialog from closing on map interaction.

**`src/components/home/LocationMapContent.jsx`**
- Swap TileLayer URL to CartoDB Voyager.

**`src/components/home/MapView.jsx`**
- Swap TileLayer URL to CartoDB Voyager.

**`src/components/spots/SpotsMapView.jsx`**
- Swap TileLayer URL to CartoDB Voyager.

**`src/pages/VenueDetails.jsx`**
- Swap TileLayer URL to CartoDB Voyager.

All changes are straightforward prop/URL swaps — no structural refactoring needed.

