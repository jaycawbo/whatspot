import React from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';

/**
 * Constellations rating sheet — slides up when user swipes up on a venue card.
 * Props:
 *  - open: boolean
 *  - onOpenChange: (open: boolean) => void
 *  - venueName: string
 *  - onRate: (rating: 'disliked' | 'liked' | 'loved') => void
 *  - onCancel: () => void
 */
export default function ConstellationsSheet({ open, onOpenChange, venueName, onRate, onCancel }) {
  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      onCancel?.();
    }
    onOpenChange(isOpen);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[50vh]">
        <DrawerHeader className="text-center pb-1">
          <DrawerTitle className="text-base font-semibold text-foreground truncate">
            {venueName}
          </DrawerTitle>
          <DrawerDescription className="text-lg font-medium text-foreground mt-1">
            How was it?
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex items-center justify-center gap-4 px-6 py-4">
          <button
            onClick={() => onRate('disliked')}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-destructive/10 transition-colors min-w-[90px]"
          >
            <span className="text-2xl">👎</span>
            <span className="text-xs font-medium text-muted-foreground">Didn't Like It</span>
          </button>

          <button
            onClick={() => onRate('liked')}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-green-500/10 transition-colors min-w-[90px]"
          >
            <span className="text-2xl">👍</span>
            <span className="text-xs font-medium text-muted-foreground">Liked It</span>
          </button>

          <button
            onClick={() => onRate('loved')}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-purple-500/10 transition-colors min-w-[90px]"
          >
            <span className="text-2xl">👍👍</span>
            <span className="text-xs font-medium text-muted-foreground">Loved It</span>
          </button>
        </div>

        <DrawerFooter className="pt-0">
          <button
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto py-2"
          >
            Cancel
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
