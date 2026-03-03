import React from 'react';

export default function SuggestedChips({ chips, onAppendChip }) {
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
