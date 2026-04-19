import React from 'react';
import { X } from 'lucide-react';

export default function CorrectionBanner({ correctedQuery, rawQuery, onUndo, onDismiss }) {
  if (!correctedQuery || !rawQuery || correctedQuery === rawQuery) return null;

  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-muted text-sm text-muted-foreground mb-3">
      <span className="flex-1 leading-snug">
        Showing results for{' '}
        <span className="font-medium text-foreground">'{correctedQuery}'</span>.{' '}
        <button
          onClick={onUndo}
          className="underline text-foreground hover:text-primary transition-colors"
        >
          Search '{rawQuery}' instead?
        </button>
      </span>
      <button
        onClick={onDismiss}
        className="shrink-0 mt-0.5 h-5 w-5 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
        aria-label="Dismiss correction"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
