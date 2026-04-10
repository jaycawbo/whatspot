import L from 'leaflet';

/**
 * Inline SVG strings matching the category chip icons from CategoryTiles.jsx
 * (UtensilsCrossed, Wine, Coffee, CakeSlice, Zap)
 */
const ICON_SVGS = {
  food: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/></svg>`,
  drinks: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="m19 2-7 8-7-8Z"/></svg>`,
  coffee: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/></svg>`,
  bakery: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>`,
  quickbites: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`,
};

const STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

/**
 * Map Google Place types / venue category to icon key.
 * Uses the same mapping logic as CategoryTiles.jsx chips.
 */
function getVenueIconKey(venue) {
  const cat = (venue.category || venue.cuisine_type || '').toLowerCase();
  const types = venue.types || venue._rawTypes || [];
  const allText = [cat, ...types].join(' ');

  if (/coffee|cafe|tea/.test(allText)) return 'coffee';
  if (/bar|pub|wine|cocktail|lounge|night_club|brewery|beer|hookah/.test(allText)) return 'drinks';
  if (/bakery|pastry|cake|donut|dessert|ice_cream|chocolate|candy|confection|bagel/.test(allText)) return 'bakery';
  if (/fast_food|quick|snack|pizza_delivery|meal_delivery|meal_takeaway/.test(allText)) return 'quickbites';
  return 'food'; // default for restaurants
}

/**
 * Determine pill background color based on saved status.
 * @param {string} venueId - google_place_id
 * @param {Set} spotsIds - Set of venue IDs in user's Spots
 * @param {Set} favIds - Set of venue IDs in user's Favourites
 */
function getPillColor(venueId, spotsIds, favIds) {
  if (favIds?.has(venueId)) return '#16A34A'; // green for favourites
  if (spotsIds?.has(venueId)) return '#111111'; // near-black for spots
  return '#4B5563'; // charcoal gray default
}

/**
 * Create a Leaflet divIcon pill marker for a venue.
 */
export function createPillMarker(venue, { spotsIds, favIds } = {}) {
  const placeId = (venue.place_id || venue.google_place_id || '').replace(/^places\//, '');
  const iconKey = getVenueIconKey(venue);
  const iconSvg = ICON_SVGS[iconKey] || ICON_SVGS.food;
  const rating = venue.rating != null ? Number(venue.rating).toFixed(1) : '—';
  const bgColor = getPillColor(placeId, spotsIds, favIds);

  const html = `
    <div style="
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: ${bgColor};
      color: white;
      padding: 4px 10px;
      border-radius: 999px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      line-height: 1;
    ">
      ${iconSvg}
      <span>${rating}</span>
      ${STAR_SVG}
    </div>
  `;

  return L.divIcon({
    className: '',
    html,
    iconSize: [70, 28],
    iconAnchor: [35, 28],
    popupAnchor: [0, -30],
  });
}
