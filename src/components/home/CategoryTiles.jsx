import React from 'react';
import { cn } from '@/lib/utils';
import { UtensilsCrossed, Wine, Coffee, CakeSlice, Zap } from 'lucide-react';

const categories = [
  { icon: UtensilsCrossed, label: 'Food', prompt: 'best restaurants nearby' },
  { icon: Wine, label: 'Drinks', prompt: 'popular bars and drinks nearby' },
  { icon: Coffee, label: 'Coffee', prompt: 'great coffee shops nearby' },
  { icon: CakeSlice, label: 'Baked Goods', prompt: 'bakeries and pastry shops nearby' },
  { icon: Zap, label: 'Quick Bites', prompt: 'quick bites and fast food nearby' },
];

export default function CategoryTiles({ onSelectCategory, compact }) {
  return (
    <div className={cn('flex flex-wrap justify-center gap-2', compact && 'gap-1.5')}>
      {categories.map((cat) => {
        const Icon = cat.icon;
        return (
          <button
            key={cat.label}
            onClick={() => onSelectCategory(cat)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 hover:bg-accent hover:border-accent-foreground/20 transition-colors',
              compact && 'px-3 py-2'
            )}
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{cat.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { categories };
