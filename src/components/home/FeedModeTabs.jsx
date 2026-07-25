import React, { useEffect, useRef } from 'react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'walkin',  label: 'Walk-In Friendly' },
  { key: 'new',     label: 'New'     },
  { key: 'trending', label: 'Trending' },
  { key: 'popular', label: 'Popular'  },
  // Wired up but hidden until personalization ships — flip `hidden` to false to reintroduce.
  { key: 'for_you', label: 'For You', hidden: true },
];

export default function FeedModeTabs({ onTabChange, tabDataMap = {} }) {
  const { state, dispatch } = useGlobalState();
  const active = state.feedTab || 'walkin';
  // True once the user has explicitly picked a tab — auto-switch below only kicks in
  // for the untouched default landing tab, never overriding an intentional selection.
  const hasUserSelectedRef = useRef(false);

  const handleSelect = (key) => {
    hasUserSelectedRef.current = true;
    dispatch({ type: 'SET_FEED_TAB', payload: key });
    onTabChange?.(key);
  };

  // Hidden until its prefetch confirms it has results — avoids a tab appearing and then
  // disappearing once an empty prefetch resolves.
  const visibleTabs = TABS.filter(({ key, hidden }) => !hidden && tabDataMap[key]?.isEmpty === false);

  // If the default landing tab (Walk-In Friendly) turns out empty for this location and
  // the user hasn't chosen a tab yet, land on the first tab that actually has results
  // instead of leaving them on a hidden tab behind a "not enough data" placeholder.
  useEffect(() => {
    if (hasUserSelectedRef.current) return;
    if (tabDataMap[active]?.isEmpty !== true) return;
    const fallback = visibleTabs[0];
    if (fallback && fallback.key !== active) {
      dispatch({ type: 'SET_FEED_TAB', payload: fallback.key });
      onTabChange?.(fallback.key);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabDataMap]);

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
