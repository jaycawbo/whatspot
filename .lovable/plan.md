

## Revert Logo to Original SVG File

The current `WhatspotLogo.jsx` uses a hand-drawn inline SVG (a generic map pin icon + "Whatspot" text). Your original uploaded logo at `src/assets/whatspot_logo.svg` is never imported or used anywhere.

### Plan

**Edit `src/components/brand/WhatspotLogo.jsx`:**
- Replace the inline SVG with an `<img>` tag that imports `src/assets/whatspot_logo.svg`
- Keep the size variants but adapt them for an image-based logo (using height classes instead of icon+text)
- The SVG file is valid and has a wide aspect ratio (2047×577), so it will render as a horizontal wordmark — just needs appropriate height constraints per size variant:
  - `sm`: `h-5`
  - `nav`: `h-6`
  - `hero`: `h-9 md:h-10`
- Remove the separate text `<span>` since the uploaded SVG already contains the full logo

