import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_NOTES = 350;

function ThumbsDownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

function ThumbsUpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10V22" />
      <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function TwoThumbsUpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <g transform="scale(0.55) translate(0, 7)" opacity="0.45">
        <path d="M7 10V22" />
        <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
      <g transform="scale(0.55) translate(20, 0)">
        <path d="M7 10V22" />
        <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
    </svg>
  );
}

const RATING_OPTIONS = [
  { value: 'disliked', label: "Didn't Like", icon: ThumbsDownIcon, activeClass: 'border-destructive text-destructive bg-destructive/10' },
  { value: 'liked',    label: 'Liked It',    icon: ThumbsUpIcon,   activeClass: 'border-green-500 text-green-600 bg-green-50' },
  { value: 'loved',    label: 'Love It',     icon: TwoThumbsUpIcon, activeClass: 'border-rose-400 text-rose-500 bg-rose-50' },
];

export default function ConstellationsSheet({ open, onOpenChange, venue, venueName, onRate, onCancel }) {
  const displayName = venueName || venue?.name || venue?.displayName?.text || 'This place';

  // Persist rating + notes per venue across open/close
  const savedState = useRef({});

  const venueId = venue?.google_place_id || venue?.place_id || '';
  const [selectedRating, setSelectedRating] = useState(null);
  const [notes, setNotes] = useState('');

  // Restore state when venue changes or sheet opens
  useEffect(() => {
    if (open && venueId) {
      const saved = savedState.current[venueId] || {};
      setSelectedRating(saved.rating || null);
      setNotes(saved.notes || '');
    }
  }, [open, venueId]);

  // Persist state on every change
  useEffect(() => {
    if (venueId) {
      savedState.current[venueId] = { rating: selectedRating, notes };
    }
  }, [venueId, selectedRating, notes]);

  const handleClose = useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  const handleDone = useCallback(() => {
    if (!selectedRating) return;
    // Clear persisted state for this venue
    delete savedState.current[venueId];
    onRate(selectedRating, notes.trim() || null);
    onOpenChange(false);
  }, [selectedRating, notes, venueId, onRate, onOpenChange]);

  const handleNotesChange = (e) => {
    const val = e.target.value.slice(0, MAX_NOTES);
    setNotes(val);
  };

  return (
    <Drawer open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DrawerContent className="max-h-[75vh]">
        <div className="flex flex-col px-4 pt-2 pb-6 gap-5">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground truncate flex-1 pr-4">{displayName}</h3>
            <button
              onClick={handleClose}
              className="shrink-0 rounded-full p-1.5 hover:bg-accent text-muted-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Rating buttons */}
          <div className="grid grid-cols-3 gap-2">
            {RATING_OPTIONS.map(({ value, label, icon: Icon, activeClass }) => {
              const active = selectedRating === value;
              return (
                <button
                  key={value}
                  onClick={() => setSelectedRating(active ? null : value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 py-4 transition-all',
                    active ? activeClass : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Notes textarea */}
          <div className="space-y-1.5">
            <textarea
              value={notes}
              onChange={handleNotesChange}
              placeholder="Add a personal note... (optional)"
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground text-right">
              {notes.length}/{MAX_NOTES}
            </p>
          </div>

          {/* Done button */}
          <Button
            onClick={handleDone}
            disabled={!selectedRating}
            className="w-full"
          >
            Done
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
