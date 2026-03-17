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
 * Minimal outlined thumbs-down icon — clean stroke, no fill.
 */
function ThumbsDownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15V4a2 2 0 0 1 2-2h1.67a2 2 0 0 1 1.95 1.56L17.26 11H20a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-4.5l.96 4.57a1 1 0 0 1-.98 1.18h-.28a2 2 0 0 1-1.78-1.1L10 15Z" />
      <path d="M2 11h4v6H2z" />
    </svg>
  );
}

/**
 * Minimal outlined thumbs-up icon — clean stroke, no fill.
 */
function ThumbsUpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V4a2 2 0 0 0-2-2h-1.67a2 2 0 0 0-1.95 1.56L6.74 11H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4.5l-.96 4.57a1 1 0 0 0 .98 1.18h.28a2 2 0 0 0 1.78-1.1L14 15Z" />
      <path d="M18 7h4v6h-4z" />
    </svg>
  );
}

/**
 * Double thumbs-up icon — two overlapping outlined thumbs, clean stroke, no fill.
 */
function DoubleThumbsUpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Back thumb */}
      <g opacity="0.5">
        <path d="M11 9V4.5a1.8 1.8 0 0 0-1.8-1.8h-1.5a1.8 1.8 0 0 0-1.76 1.4L3.6 11H1.6a1.8 1.8 0 0 0-1.8 1.8v1.8a1.8 1.8 0 0 0 1.8 1.8h4l-.86 4.1a.9.9 0 0 0 .88 1.06h.25a1.8 1.8 0 0 0 1.6-1L11 15Z" />
        <path d="M14.4 7.2h3.6v5.4h-3.6z" />
      </g>
      {/* Front thumb */}
      <g>
        <path d="M18 9V4.5a1.8 1.8 0 0 0-1.8-1.8h-1.5a1.8 1.8 0 0 0-1.76 1.4L10.6 11H8.6a1.8 1.8 0 0 0-1.8 1.8v1.8a1.8 1.8 0 0 0 1.8 1.8h4l-.86 4.1a.9.9 0 0 0 .88 1.06h.25a1.8 1.8 0 0 0 1.6-1L18 15Z" />
        <path d="M21.4 7.2H25v5.4h-3.6z" />
      </g>
    </svg>
  );
}

/**
 * Constellations rating sheet — slides up when user swipes up on a venue card.
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
            <ThumbsDownIcon className="h-7 w-7 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Didn't Like It</span>
          </button>

          <button
            onClick={() => onRate('liked')}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-green-500/10 transition-colors min-w-[90px]"
          >
            <ThumbsUpIcon className="h-7 w-7 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Liked It</span>
          </button>

          <button
            onClick={() => onRate('loved')}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-5 py-4 hover:bg-blue-500/10 transition-colors min-w-[90px]"
          >
            <DoubleThumbsUpIcon className="h-7 w-7 text-muted-foreground" />
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
