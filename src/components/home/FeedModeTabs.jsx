import React from 'react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'walkin',  label: 'Walk-In Friendly' },
  { key: 'new',     label: 'New'     },
  { key: 'trending', label: 'Trending' },
  { key: 'popular', label: 'Popular'  },
];

export default function FeedModeTabs({ trendingAvailable, onTabChange }) {
  const { state, dispatch } = useGlobalState();
  const active = state.feedTab || 'walkin';

  const handleSelect = (key) => {
    dispatch({ type: 'SET_FEED_TAB', payload: key });
    onTabChange?.(key);
  };

  // Hide Trending until we've confirmed at least one trending venue exists —
  // avoids presenting a tab that just leads to a "not enough data" dead end.
  const visibleTabs = TABS.filter(({ key }) => key !== 'trending' || trendingAvailable);

  return (
    <div className="flex items-center gap-6 px-2">
      {visibleTabs.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => handleSelect(key)}
            className={cn(
              'relative pb-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-[#22c55e]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
