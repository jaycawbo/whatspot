import React from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { ChevronUp } from 'lucide-react';
import SearchBar from './SearchBar';
import CategoryTiles from './CategoryTiles';
import SuggestedChips from './SuggestedChips';

export default function MobileBottomSheet({
  query,
  onQueryChange,
  onSearch,
  isQuerying,
  onStopQuery,
  suggestedChips,
  onAppendChip,
  onSelectCategory,
  searchHistory,
}) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-4 py-2 shadow-lg text-sm font-medium md:hidden">
          <ChevronUp className="h-4 w-4" />
          Search
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <div className="p-4 space-y-4 overflow-y-auto">
          <SearchBar
            query={query}
            onQueryChange={onQueryChange}
            onSearch={onSearch}
            isQuerying={isQuerying}
            onStopQuery={onStopQuery}
            centered={false}
          />

          <SuggestedChips chips={suggestedChips} onAppendChip={onAppendChip} />

          <CategoryTiles onSelectCategory={onSelectCategory} compact />

          {searchHistory.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">Recent searches</h4>
              <div className="space-y-1">
                {searchHistory.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => { onQueryChange(h.query); onSearch(h.query); }}
                    className="w-full text-left text-sm text-foreground px-2 py-1.5 rounded hover:bg-accent transition-colors truncate"
                  >
                    {h.query}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
