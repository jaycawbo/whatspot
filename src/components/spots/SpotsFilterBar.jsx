import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const PRICE_OPTIONS = [
  { value: 1, label: '$' },
  { value: 2, label: '$$' },
  { value: 3, label: '$$$' },
  { value: 4, label: '$$$$' },
];

const DISTANCE_OPTIONS = [
  { value: 1,    label: '1 km' },
  { value: 2,    label: '2 km' },
  { value: 5,    label: '5 km' },
  { value: 10,   label: '10 km+' },
];

function humanizeCategory(cat) {
  return (cat || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/ Restaurant$/, '')
    .trim();
}

export default function SpotsFilterBar({ filters, onChange, availableCuisines = [] }) {
  const [cuisineOpen, setCuisineOpen] = useState(false);

  const togglePrice = (val) => {
    const next = filters.priceLevels.includes(val)
      ? filters.priceLevels.filter((p) => p !== val)
      : [...filters.priceLevels, val];
    onChange({ ...filters, priceLevels: next });
  };

  const toggleCuisine = (val) => {
    const next = filters.cuisines.includes(val)
      ? filters.cuisines.filter((c) => c !== val)
      : [...filters.cuisines, val];
    onChange({ ...filters, cuisines: next });
  };

  const toggleDistance = (val) => {
    onChange({ ...filters, maxDistanceKm: filters.maxDistanceKm === val ? null : val });
  };

  const chipBase = 'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap';
  const chipActive = 'bg-foreground text-background border-foreground';
  const chipInactive = 'text-muted-foreground border-border hover:text-foreground hover:bg-accent';

  const activeCuisineCount = filters.cuisines.length;

  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
      {/* Open Now — UI only, opening_hours not stored */}
      <button
        onClick={() => onChange({ ...filters, openNow: !filters.openNow })}
        className={cn(chipBase, filters.openNow ? chipActive : chipInactive)}
      >
        Open Now
      </button>

      {/* Price */}
      {PRICE_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => togglePrice(value)}
          className={cn(chipBase, filters.priceLevels.includes(value) ? chipActive : chipInactive)}
        >
          {label}
        </button>
      ))}

      {/* Cuisine */}
      {availableCuisines.length > 0 && (
        <Popover open={cuisineOpen} onOpenChange={setCuisineOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                chipBase,
                activeCuisineCount > 0 ? chipActive : chipInactive
              )}
            >
              {activeCuisineCount > 0 ? `Cuisine (${activeCuisineCount})` : 'Cuisine'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
              {availableCuisines.map((cat) => {
                const active = filters.cuisines.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCuisine(cat)}
                    className={cn(
                      'flex items-center gap-2 rounded px-2 py-1.5 text-xs text-left transition-colors hover:bg-accent',
                      active ? 'font-medium text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <span className={cn('h-3.5 w-3.5 rounded border shrink-0', active ? 'bg-foreground border-foreground' : 'border-border')} />
                    {humanizeCategory(cat)}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Distance */}
      {DISTANCE_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => toggleDistance(value)}
          className={cn(chipBase, filters.maxDistanceKm === value ? chipActive : chipInactive)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
