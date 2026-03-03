import React from 'react';
import { SearchX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NoResultsPrompt({ onRelax, isRelaxing, noVenuesAtAll }) {
  if (noVenuesAtAll) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <SearchX className="h-12 w-12 text-muted-foreground mb-3" />
        <h3 className="text-lg font-semibold text-foreground">No venues found</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          We couldn't find any venues matching your search, even after broadening our criteria. Try a different query.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <SearchX className="h-12 w-12 text-muted-foreground mb-3" />
      <h3 className="text-lg font-semibold text-foreground">No results found</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        Try relaxing your search constraints to find more venues.
      </p>
      <Button onClick={onRelax} variant="outline" className="mt-4 gap-2" disabled={isRelaxing}>
        {isRelaxing && <Loader2 className="h-4 w-4 animate-spin" />}
        Relax constraints
      </Button>
    </div>
  );
}
