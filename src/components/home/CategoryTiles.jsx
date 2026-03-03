import React from 'react';
import { cn } from '@/lib/utils';

const categories = [
  { emoji: '🍕', label: 'Pizza', prompt: 'great pizza spots nearby' },
  { emoji: '☕', label: 'Coffee', prompt: 'great coffee shops nearby' },
  { emoji: '🍺', label: 'Bars', prompt: 'popular bars nearby' },
  { emoji: '🍣', label: 'Sushi', prompt: 'best sushi restaurants nearby' },
  { emoji: '🍔', label: 'Burgers', prompt: 'best burger joints nearby' },
  { emoji: '🥗', label: 'Healthy', prompt: 'healthy food restaurants nearby' },
  { emoji: '🍜', label: 'Ramen', prompt: 'best ramen shops nearby' },
  { emoji: '🥐', label: 'Brunch', prompt: 'great brunch spots nearby' },
  { emoji: '🍷', label: 'Wine Bars', prompt: 'cozy wine bars nearby' },
  { emoji: '🌮', label: 'Tacos', prompt: 'best tacos nearby' },
  { emoji: '🍦', label: 'Desserts', prompt: 'dessert places nearby' },
  { emoji: '🥩', label: 'Steakhouse', prompt: 'top steakhouses nearby' },
];

export default function CategoryTiles({ onSelectCategory, compact }) {
  return (
    <div
      className={cn(
        'grid gap-2',
        compact ? 'grid-cols-4 md:grid-cols-6' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'
      )}
    >
      {categories.map((cat) => (
        <button
          key={cat.label}
          onClick={() => onSelectCategory(cat)}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card p-3 hover:bg-accent hover:border-accent-foreground/20 transition-colors text-center"
        >
          <span className="text-2xl">{cat.emoji}</span>
          <span className="text-xs font-medium text-foreground">{cat.label}</span>
        </button>
      ))}
    </div>
  );
}

export { categories };
