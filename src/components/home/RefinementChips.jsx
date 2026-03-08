import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// ─── Static chip sets keyed by canonical base query ───
const CHIP_SETS = {
  'best restaurants nearby': [
    { label: 'outdoor seating', type: 'feature' },
    { label: 'romantic vibes', type: 'vibe' },
    { label: 'hidden gem vibes', type: 'vibe' },
    { label: 'family-friendly options', type: 'audience' },
    { label: 'late night hours', type: 'feature' },
    { label: 'upscale dining', type: 'vibe' },
    { label: 'budget-friendly prices', type: 'price' },
    { label: 'special occasion worthy', type: 'occasion' },
  ],
  'popular bars and drinks nearby': [
    { label: 'craft cocktails', type: 'feature' },
    { label: 'happy hour deals', type: 'feature' },
    { label: 'late night energy', type: 'feature' },
    { label: 'outdoor seating', type: 'feature' },
    { label: 'trivia nights', type: 'vibe' },
    { label: 'great wine selection', type: 'feature' },
    { label: 'pet-friendly patio', type: 'audience' },
    { label: 'cozy vibes', type: 'vibe' },
  ],
  'great coffee shops nearby': [
    { label: 'strong WiFi', type: 'feature' },
    { label: 'cozy vibes', type: 'vibe' },
    { label: 'quiet atmosphere', type: 'vibe' },
    { label: 'study-friendly seating', type: 'audience' },
    { label: 'outdoor seating', type: 'feature' },
    { label: 'artisan roasts', type: 'vibe' },
    { label: 'budget-friendly options', type: 'price' },
    { label: 'specialty drinks', type: 'feature' },
  ],
  'bakeries and pastry shops nearby': [
    { label: 'fresh croissants', type: 'feature' },
    { label: 'artisan pastries', type: 'vibe' },
    { label: 'family-friendly options', type: 'audience' },
    { label: 'budget-friendly treats', type: 'price' },
    { label: 'gluten-free options', type: 'feature' },
    { label: 'custom cakes', type: 'feature' },
    { label: 'French-style pastries', type: 'vibe' },
    { label: 'specialty desserts', type: 'feature' },
  ],
  'quick bites and fast food nearby': [
    { label: 'grab-and-go options', type: 'vibe' },
    { label: 'cheap eats', type: 'price' },
    { label: 'healthy options', type: 'feature' },
    { label: 'kid-friendly options', type: 'audience' },
    { label: 'late night hours', type: 'feature' },
    { label: 'drive-through service', type: 'feature' },
    { label: 'local flavor', type: 'vibe' },
    { label: 'vegan options', type: 'feature' },
  ],
};

// ─── Fuzzy keyword → canonical key mapping ───
const FUZZY_MAP = [
  { keywords: ['restaurant', 'food', 'dining', 'eat'], key: 'best restaurants nearby' },
  { keywords: ['bar', 'bars', 'pub', 'drinks', 'nightlife'], key: 'popular bars and drinks nearby' },
  { keywords: ['coffee', 'café', 'cafe', 'latte', 'espresso'], key: 'great coffee shops nearby' },
  { keywords: ['bakery', 'bakeries', 'dessert', 'pastry', 'cake'], key: 'bakeries and pastry shops nearby' },
  { keywords: ['quick', 'bite', 'fast', 'snack', 'grab'], key: 'quick bites and fast food nearby' },
];

function resolveStaticChips(query) {
  if (!query) return null;
  const lower = query.toLowerCase().trim();

  // Exact match first
  if (CHIP_SETS[lower]) return CHIP_SETS[lower];

  // Fuzzy keyword match
  for (const { keywords, key } of FUZZY_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return CHIP_SETS[key];
    }
  }

  return null; // triggers LLM generation
}

export default function RefinementChips({ baseQuery, onAppendChip }) {
  const [chips, setChips] = useState([]);
  const [removedChips, setRemovedChips] = useState(new Set());
  const [chipsAddedCount, setChipsAddedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [fadingChip, setFadingChip] = useState(null);
  const prevBaseQuery = useRef(baseQuery);
  const abortRef = useRef(null);

  // Reset session state and resolve chips when baseQuery changes
  useEffect(() => {
    if (baseQuery === prevBaseQuery.current && chips.length > 0) return;
    prevBaseQuery.current = baseQuery;
    setRemovedChips(new Set());
    setChipsAddedCount(0);
    setFadingChip(null);

    if (!baseQuery) {
      setChips([]);
      return;
    }

    const staticChips = resolveStaticChips(baseQuery);
    if (staticChips) {
      setChips(staticChips);
      setIsLoading(false);
      return;
    }

    // Custom query → LLM generation
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setChips([]);

    const timeout = setTimeout(() => controller.abort(), 3000);

    supabase.functions
      .invoke('generate-refinement-chips', { body: { query: baseQuery } })
      .then(({ data, error }) => {
        clearTimeout(timeout);
        if (controller.signal.aborted) return;
        if (!error && data?.chips?.length) {
          setChips(data.chips.map((label) => ({ label, type: 'generated' })));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [baseQuery]);

  const handleChipClick = useCallback(
    (chip, index) => {
      setFadingChip(chip.label);

      const connector = chipsAddedCount === 0 ? ' with ' : ' and ';

      setTimeout(() => {
        setRemovedChips((prev) => new Set([...prev, chip.label]));
        setFadingChip(null);
        setChipsAddedCount((c) => c + 1);
        onAppendChip(chip.label, connector);
      }, 200);
    },
    [chipsAddedCount, onAppendChip]
  );

  const visibleChips = chips.filter((c) => !removedChips.has(c.label));

  if (!isLoading && visibleChips.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Refine your search</p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 h-8 rounded-full bg-muted animate-pulse"
                style={{ width: `${72 + i * 16}px` }}
              />
            ))
          : visibleChips.map((chip, i) => (
              <button
                key={chip.label}
                onClick={() => handleChipClick(chip, i)}
                className={cn(
                  'shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-all duration-200 whitespace-nowrap',
                  fadingChip === chip.label && 'opacity-0 -translate-x-2 pointer-events-none'
                )}
              >
                {chip.label}
              </button>
            ))}
      </div>
    </div>
  );
}
