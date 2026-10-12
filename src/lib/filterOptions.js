// Shared filter option data used by both the Feed/Search filter sheet
// (FilterDialog.jsx) and the Spots filter sheet (SpotsFilterBar.jsx).

// Google Places type → display label (most common first, then alphabetical)
export const CUISINE_TYPES = [
  { value: 'italian_restaurant',       label: 'Italian'          },
  { value: 'japanese_restaurant',      label: 'Japanese'         },
  { value: 'mexican_restaurant',       label: 'Mexican'          },
  { value: 'chinese_restaurant',       label: 'Chinese'          },
  { value: 'american_restaurant',      label: 'American'         },
  { value: 'thai_restaurant',          label: 'Thai'             },
  { value: 'indian_restaurant',        label: 'Indian'           },
  { value: 'korean_restaurant',        label: 'Korean'           },
  { value: 'mediterranean_restaurant', label: 'Mediterranean'    },
  { value: 'french_restaurant',        label: 'French'           },
  { value: 'vietnamese_restaurant',    label: 'Vietnamese'       },
  { value: 'middle_eastern_restaurant',label: 'Middle Eastern'   },
  { value: 'greek_restaurant',         label: 'Greek'            },
  { value: 'spanish_restaurant',       label: 'Spanish'          },
  { value: 'breakfast_restaurant',     label: 'Breakfast/Brunch' },
];

// Chips that should also match closely related Google types. Mirrors
// supabase/functions/_shared/cuisineTypes.ts so Spots filters the same way the feed does.
export const CUISINE_EXPANSIONS = {
  breakfast_restaurant: ['brunch_restaurant'],
  italian_restaurant: ['pizza_restaurant'],
};

export function expandCuisines(cuisines) {
  return [...new Set(cuisines.flatMap((c) => [c, ...(CUISINE_EXPANSIONS[c] ?? [])]))];
}

export const PRICE_LEVEL_LABELS = ['$', '$$', '$$$', '$$$$'];

// Search's Min Rating filter. 0 = Any. The feed ignores it and uses recommend's
// DISCOVERY_CRITERIA ladder (4.5 first) so it never runs out.
export const DEFAULT_MIN_RATING = 4.5;
export const MIN_RATING_OPTIONS = [
  { value: 0,   label: 'Any'  },
  { value: 4.0, label: '4.0+' },
  { value: 4.3, label: '4.3+' },
  { value: 4.5, label: '4.5+' },
  { value: 4.7, label: '4.7+' },
];

export function humanizeCategory(cat) {
  return (cat || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/ Restaurant$/, '')
    .trim();
}
