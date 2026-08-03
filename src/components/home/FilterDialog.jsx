import React from 'react';
import FilterSheet from '@/components/filters/FilterSheet';
import { CUISINE_TYPES, PRICE_LEVEL_LABELS } from '@/lib/filterOptions';

const PRICE_OPTIONS = PRICE_LEVEL_LABELS.map((label) => ({ value: label, label }));

const DEFAULT_FILTERS = {
  openNow: false,
  priceLevels: [],
  cuisines: [],
  radius: 5,
  walkInOnly: false,
};

export default function FilterDialog({ filters, onFilterChange, open, onOpenChange }) {
  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      filters={filters}
      defaultFilters={DEFAULT_FILTERS}
      onApply={onFilterChange}
      showOpenNow
      showWalkInOnly
      priceOptions={PRICE_OPTIONS}
      cuisineOptions={CUISINE_TYPES}
      radius={{ min: 0.5, max: 25, step: 0.5, label: 'Search Radius', unit: 'km' }}
    />
  );
}
