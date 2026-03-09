import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

function formatPriceLevels(levels) {
  if (!levels || levels.length === 0) return 'Any price';
  const sorted = [...levels].sort((a, b) => a.length - b.length);
  const allLevels = ['$', '$$', '$$$', '$$$$'];
  const indices = sorted.map(l => allLevels.indexOf(l)).filter(i => i !== -1).sort((a, b) => a - b);
  
  if (indices.length === 0) return sorted.join(', ');

  let isContiguous = true;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) {
      isContiguous = false;
      break;
    }
  }

  if (isContiguous && indices.length > 1) {
    return `${allLevels[indices[0]]}-${allLevels[indices[indices.length - 1]]}`;
  }
  return sorted.join(', ');
}

function getFilterSummaryText(filters) {
  const parts = [];

  parts.push(filters.openNow ? 'Open now' : 'Any hours');
  parts.push(formatPriceLevels(filters.priceLevels));
  parts.push(`within ${filters.radius} km`);

  return parts.join(', ');
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
