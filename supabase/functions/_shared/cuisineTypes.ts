// Cuisine chips that should also match closely related Google types — e.g. a
// pizza-only venue is Italian, a brunch-only venue belongs under Breakfast/Brunch.
// Mirrors CUISINE_EXPANSIONS in src/lib/filterOptions.js (issue #380).
const CUISINE_EXPANSIONS: Record<string, string[]> = {
  breakfast_restaurant: ['brunch_restaurant'],
  italian_restaurant: ['pizza_restaurant'],
};

export function expandCuisineTypes(types: string[] | null | undefined): string[] | undefined {
  if (!Array.isArray(types) || types.length === 0) return undefined;
  return [...new Set(types.flatMap((t) => [t, ...(CUISINE_EXPANSIONS[t] ?? [])]))];
}
