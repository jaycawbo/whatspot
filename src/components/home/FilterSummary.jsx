import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

function getFilterSummaryText(filters) {
  const parts = [];

  // Open now
  parts.push(filters.openNow ? 'Open now' : 'Any hours');

  // Price
  if (filters.priceLevels.length === 0) {
    parts.push('any price');
  } else {
    parts.push(filters.priceLevels.join(', '));
  }

  // Radius
  parts.push(`within ${filters.radius} km`);

  // Join with commas, last with "and"
  if (parts.length <= 2) return parts.join(' and ');
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}

export default function FilterSummary({ filters, onOpenFilters }) {
  const summary = getFilterSummaryText(filters);

  return (
    <button
      onClick={onOpenFilters}
      className="inline-flex items-center gap-2 text-left group"
    >
      <span className="inline-flex items-center justify-center rounded-full border border-border bg-card group-hover:bg-accent group-hover:border-accent-foreground/20 transition-colors shrink-0 h-[34px] w-[34px]">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
      <span className="text-sm italic text-muted-foreground">{summary}</span>
    </button>
  );
}
