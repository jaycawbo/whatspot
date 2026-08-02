import React, { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FilterSheet from '@/components/filters/FilterSheet';
import { CUISINE_TYPES, PRICE_LEVEL_LABELS, humanizeCategory } from '@/lib/filterOptions';
import { cn } from '@/lib/utils';

const PRICE_OPTIONS = PRICE_LEVEL_LABELS.map((label, i) => ({ value: i + 1, label }));

export const DEFAULT_SPOTS_FILTERS = {
  walkInOnly: false,
  priceLevels: [],
  cuisines: [],
  radius: null,
};

export default function SpotsFilterBar({ filters, onChange, availableCuisines = [] }) {
  const [open, setOpen] = useState(false);

  // Static cuisine list (shared with Feed/Search) plus any category present
  // in the user's saved spots that isn't already covered by it.
  const cuisineOptions = useMemo(() => {
    const staticValues = new Set(CUISINE_TYPES.map((c) => c.value));
    const extra = availableCuisines
      .filter((c) => !staticValues.has(c))
      .map((c) => ({ value: c, label: humanizeCategory(c) }));
    return [...CUISINE_TYPES, ...extra];
  }, [availableCuisines]);

  const activeCount =
    filters.priceLevels.length +
    filters.cuisines.length +
    (filters.walkInOnly ? 1 : 0) +
    (filters.radius !== null ? 1 : 0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn('relative', activeCount > 0 && 'border-foreground')}
      >
        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-1.5 rounded-full bg-foreground text-background text-[10px] leading-none px-1.5 py-0.5">
            {activeCount}
          </span>
        )}
      </Button>

      <FilterSheet
        open={open}
        onOpenChange={setOpen}
        filters={filters}
        defaultFilters={DEFAULT_SPOTS_FILTERS}
        onApply={onChange}
        showWalkInOnly
        priceOptions={PRICE_OPTIONS}
        cuisineOptions={cuisineOptions}
        radius={{ min: 1, max: 25, step: 1, label: 'Distance', unit: 'km', nullable: true }}
      />
    </>
  );
}
