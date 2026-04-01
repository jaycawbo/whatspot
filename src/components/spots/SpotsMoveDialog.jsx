import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const ALL_LISTS = [
  { name: 'Favourites',     emoji: '❤️' },
  { name: 'Interested',     emoji: '⭐' },
  { name: 'Been To',        emoji: '✅' },
  { name: 'Not Interested', emoji: '👎' },
  { name: "Didn't Like It", emoji: '😐' },
];

export default function SpotsMoveDialog({ open, onOpenChange, currentList, onMove }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-base">Move to list</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1 pt-1">
          {ALL_LISTS.map(({ name, emoji }) => (
            <button
              key={name}
              onClick={() => { onMove(name); onOpenChange(false); }}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-left transition-colors hover:bg-accent',
                currentList === name ? 'bg-accent font-medium' : 'text-foreground'
              )}
            >
              <span>{emoji}</span>
              {name}
              {currentList === name && (
                <span className="ml-auto text-xs text-muted-foreground">current</span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
