import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Heart, Trash2, X, Check } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useSpots } from '@/hooks/useSpots';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { logEvent } from '@/lib/logEvent';

// Preset system lists — must match LABEL_TO_INTERACTION keys in useSpots.js
const SYSTEM_LISTS = [
  'Favourites',
  'Interested',
  'Been To',
  'Not Interested',
  "Didn't Like It",
];

const SUGGESTED_LABELS = [
  'Top Spot',
  'Special Occasion',
  'Date Night',
  'Business Meal',
  'Hidden Gem',
  'Best Cocktails',
  'Good for Groups',
  'Neighbourhood Gem',
  'Underrated',
  'Worth the Wait',
  'Would Not Go Back',
];

const ALL_PRESET_LABELS = [...SYSTEM_LISTS, ...SUGGESTED_LABELS];

export default function SaveToSpotsDialog({ open, onOpenChange, venue }) {
  const { isSaved, getLabels, saveSpot, removeSpot, updateLabels, isSaving, isRemoving } = useSpots();

  const placeId = venue?.place_id?.replace(/^places\//, '') || venue?.google_place_id;
  const saved = isSaved(placeId);
  const currentLabels = getLabels(placeId);

  const [selectedLabels, setSelectedLabels] = useState([]);
  const [customInput, setCustomInput] = useState('');
  const [previewImgReady, setPreviewImgReady] = useState(false);

  const customTypedLabels = selectedLabels.filter(
    (l) => !ALL_PRESET_LABELS.includes(l)
  );

  useEffect(() => {
    if (open) {
      setSelectedLabels(currentLabels);
      setCustomInput('');
      setPreviewImgReady(false);
    }
  }, [open, currentLabels.join(',')]);

  const toggleLabel = (label) => {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const addCustomLabel = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (!selectedLabels.includes(trimmed)) {
      setSelectedLabels((prev) => [...prev, trimmed]);
    }
    setCustomInput('');
  };

  const removeCustomLabel = (label) => {
    setSelectedLabels((prev) => prev.filter((l) => l !== label));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomLabel();
    }
  };

  const handleDone = async () => {
    try {
      if (saved) {
        await updateLabels({ placeId, labels: selectedLabels });
        toast.success('Labels updated');
      } else {
        await saveSpot({ venue, labels: selectedLabels });
        toast.success(`${venue.name} added to Spots`);
        logEvent('save', {
          venue_id: venue.place_id || venue.google_place_id,
          neighborhood_context: venue.address,
        });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to save spot');
      console.error(err);
    }
  };

  const handleRemove = async () => {
    try {
      await removeSpot(placeId);
      toast.success(`${venue.name} removed from Spots`);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to remove spot');
      console.error(err);
    }
  };

  if (!venue) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md flex flex-col overflow-hidden max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className={cn('h-5 w-5', saved ? 'fill-red-500 text-red-500' : 'text-muted-foreground')} />
            {saved ? 'Edit Spot' : 'Save to Spots'}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 space-y-4 py-2">
          {/* Venue preview */}
          <div className="flex gap-3 items-center rounded-lg border border-border bg-muted/30 p-3">
            {(venue.image_urls?.[0] || venue.photo_urls?.[0]) && (
              <div className="relative shrink-0">
                <img
                  src={venue.image_urls?.[0] || venue.photo_urls?.[0]}
                  alt={venue.name}
                  className="h-12 w-12 rounded-md object-cover"
                  onLoad={() => setPreviewImgReady(true)}
                  onError={() => setPreviewImgReady(true)}
                />
                {!previewImgReady && (
                  <>
                    <div className="absolute inset-0 rounded-md animate-pulse bg-muted-foreground/25" />
                    <div className="absolute inset-0 rounded-md shimmer-sweep" />
                  </>
                )}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-sm text-foreground truncate">{venue.name}</p>
              <p className="text-xs text-muted-foreground truncate">{venue.address}</p>
            </div>
          </div>

          {/* Labels */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Lists</p>
            <div className="flex flex-wrap gap-1.5">
              {SYSTEM_LISTS.map((label) => {
                const active = selectedLabels.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggleLabel(label)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-accent/50 text-accent-foreground border-transparent hover:bg-accent'
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {label}
                  </button>
                );
              })}
            </div>

            <Separator />

            <p className="text-sm font-medium text-foreground">Suggested lists</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_LABELS.map((label) => {
                const active = selectedLabels.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggleLabel(label)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors border',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-accent/50 text-accent-foreground border-transparent hover:bg-accent'
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {label}
                  </button>
                );
              })}
            </div>

            {customTypedLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customTypedLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                  >
                    {label}
                    <button onClick={() => removeCustomLabel(label)} className="hover:opacity-70">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <Input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Or type your own label..."
              className="h-8 text-xs bg-background"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleDone} disabled={isSaving} className="w-full">
            {isSaving ? 'Saving...' : 'Done'}
          </Button>
          {saved && (
            <Button
              variant="ghost"
              onClick={handleRemove}
              disabled={isRemoving}
              className="w-full text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isRemoving ? 'Removing...' : 'Remove from Spots'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
