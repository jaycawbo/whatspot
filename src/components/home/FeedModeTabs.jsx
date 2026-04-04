import React from 'react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'for_you', label: 'For You' },
  { key: 'new',     label: 'New'     },
  { key: 'trending', label: 'Trending' },
  { key: 'popular', label: 'Popular'  },
];

export default function FeedModeTabs({ onTabChange }) {
  const { state, dispatch } = useGlobalState();
  const { isAuthenticated } = useAuth();
  const active = state.feedTab || 'for_you';

  const handleSelect = (key) => {
    if (!isAuthenticated && key === 'for_you') return;
    dispatch({ type: 'SET_FEED_TAB', payload: key });
    onTabChange?.(key);
  };

  return (
    <div className="flex items-center gap-0.5 px-1 py-0.5 bg-muted/50 rounded-full w-fit mx-auto">
      {TABS.map(({ key, label }) => {
        const isActive = active === key;
        const isLocked = !isAuthenticated && key === 'for_you';
        return (
          <button
            key={key}
            onClick={() => handleSelect(key)}
            disabled={isLocked}
            className={cn(
              'px-3.5 py-1 rounded-full text-xs font-medium transition-all',
              isActive
                ? 'bg-[#22c55e] text-white shadow-sm'
                : isLocked
                ? 'text-muted-foreground/40 cursor-not-allowed'
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
