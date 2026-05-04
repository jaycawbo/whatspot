import React from 'react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'for_you', label: 'For You' },
  { key: 'new',     label: 'New'     },
  { key: 'trending', label: 'Trending' },
  { key: 'walkin',  label: 'Walk-In Friendly' },
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
    <div className="flex items-center gap-6 px-2">
      {TABS.map(({ key, label }) => {
        const isActive = active === key;
        const isLocked = !isAuthenticated && key === 'for_you';
        return (
          <button
            key={key}
            onClick={() => handleSelect(key)}
            disabled={isLocked}
            className={cn(
              'relative pb-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-[#22c55e]'
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
