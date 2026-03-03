import React from 'react';
import { cn } from '@/lib/utils';

export default function SortToggle({ sort, setSort }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">Sort by:</span>
      <button
        onClick={() => setSort('relevance')}
        className={cn(
          'px-2 py-0.5 rounded-full transition-colors',
          sort === 'relevance'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Relevance
      </button>
      <button
        onClick={() => setSort('distance')}
        className={cn(
          'px-2 py-0.5 rounded-full transition-colors',
          sort === 'distance'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        Distance
      </button>
    </div>
  );
}
