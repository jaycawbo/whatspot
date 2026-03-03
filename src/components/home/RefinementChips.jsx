import React, { useMemo } from 'react';

const REFINEMENTS = {
  'great pizza spots nearby': ['wood fired', 'by the slice', 'neapolitan', 'late night', 'delivery'],
  'great coffee shops nearby': ['outdoor patio', 'laptop friendly', 'specialty lattes', 'quiet', 'pastries'],
  'popular bars nearby': ['craft cocktails', 'rooftop', 'live music', 'sports bar', 'speakeasy'],
  'best sushi restaurants nearby': ['omakase', 'all you can eat', 'takeout', 'fresh sashimi', 'conveyor belt'],
  'best burger joints nearby': ['smash burgers', 'gourmet', 'vegan options', 'drive through', 'patio'],
  'healthy food restaurants nearby': ['salad bar', 'vegan', 'gluten free', 'smoothie bowls', 'organic'],
  'best ramen shops nearby': ['tonkotsu', 'spicy', 'vegetarian', 'late night', 'handmade noodles'],
  'great brunch spots nearby': ['bottomless mimosas', 'eggs benedict', 'pancakes', 'outdoor seating', 'family friendly'],
  'cozy wine bars nearby': ['natural wine', 'charcuterie', 'candlelit', 'small plates', 'live jazz'],
  'best tacos nearby': ['street style', 'fish tacos', 'birria', 'al pastor', 'vegan'],
  'dessert places nearby': ['ice cream', 'bubble tea', 'crêpes', 'churros', 'bakery'],
  'top steakhouses nearby': ['dry aged', 'wagyu', 'prix fixe', 'wine pairing', 'classic'],
};

export default function RefinementChips({ baseQuery, onAppendChip }) {
  const chips = useMemo(() => REFINEMENTS[baseQuery] || [], [baseQuery]);

  if (!chips.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {chips.map((chip) => (
        <button
          key={chip}
          onClick={() => onAppendChip(chip)}
          className="shrink-0 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-accent transition-colors whitespace-nowrap"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
