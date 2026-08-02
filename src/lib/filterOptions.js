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
  { value: 'other',                    label: 'Other'            },
];

export const PRICE_LEVEL_LABELS = ['$', '$$', '$$$', '$$$$'];

export function humanizeCategory(cat) {
  return (cat || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/ Restaurant$/, '')
    .trim();
}
