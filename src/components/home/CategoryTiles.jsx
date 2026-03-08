import React from 'react';
import { cn } from '@/lib/utils';
import { UtensilsCrossed, Wine, Coffee, CakeSlice, Zap, SlidersHorizontal } from 'lucide-react';

const categories = [
{ icon: UtensilsCrossed, label: 'Food', prompt: 'best restaurants nearby' },
{ icon: Wine, label: 'Drinks', prompt: 'popular bars and drinks nearby' },
{ icon: Coffee, label: 'Coffee', prompt: 'great coffee shops nearby' },
{ icon: CakeSlice, label: 'Baked Goods', prompt: 'bakeries and pastry shops nearby' },
{ icon: Zap, label: 'Quick Bites', prompt: 'quick bites and fast food nearby' }];


export default function CategoryTiles({ onSelectCategory, compact, onOpenFilters }) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto scrollbar-hide pb-1 items-center', compact && 'gap-1.5')}>
      {onOpenFilters && (
        <button
          onClick={onOpenFilters}
          className={cn(
            "inline-flex items-center justify-center rounded-full border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors shrink-0 h-[34px] w-[34px]",
            compact && 'h-[30px] w-[30px]'
          )}
          aria-label="Filters"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
      {categories.map((cat) => {
        const Icon = cat.icon;
        return (
          <button
            key={cat.label}
            onClick={() => onSelectCategory(cat)}
            className={cn("inline-flex items-center gap-1.5 rounded-full border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors whitespace-nowrap shrink-0 px-[14px] py-[8px]",

            compact && 'px-3 py-1.5'
            )}>
            
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{cat.label}</span>
          </button>);

      })}
    </div>);

}

export { categories };