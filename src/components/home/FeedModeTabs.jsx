import React from 'react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'walkin',  label: 'Walk-In Friendly' },
  { key: 'new',     label: 'New'     },
  { key: 'trending', label: 'Trending' },
  { key: 'popular', label: 'Popular'  },
];

export default function FeedModeTabs({ onTabChange }) {
  const { state, dispatch } = useGlobalState();
  const active = state.feedTab || 'walkin';

  const handleSelect = (key) => {
    dispatch({ type: 'SET_FEED_TAB', payload: key });
    onTabChange?.(key);
  };

  return (
    <div className="flex items-center gap-6 px-2">
      {TABS.map(({ key, label }) => {
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
