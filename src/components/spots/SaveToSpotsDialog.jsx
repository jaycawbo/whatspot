import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Heart, Trash2, Star, Tag, Layers, X } from 'lucide-react';
import { useSpots } from '@/hooks/useSpots';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PREDEFINED_LABELS = [
  { id: 'top-spot', label: 'Top Spot', icon: Star },
  { id: 'want-to-go', label: 'Want to Go', icon: Tag },
  { id: 'custom-label', label: 'Custom Label', icon: Layers },
];

const SUGGESTED_LABELS = [
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

export default function SaveToSpotsDialog({ open, onOpenChange, venue }) {
  const { isSaved, getLabels, saveSpot, removeSpot, updateLabels, isSaving, isRemoving } = useSpots();

  const placeId = venue?.place_id?.replace(/^places\//, '') || venue?.google_place_id;
  const saved = isSaved(placeId);
  const currentLabels = getLabels(placeId);

  const [selectedLabels, setSelectedLabels] = useState([]);
  const [customChecked, setCustomChecked] = useState(false);
  const [customInput, setCustomInput] = useState('');

  // Custom labels = any selected label that is a suggested or typed custom one
  const customSelectedLabels = selectedLabels.filter(
    (l) => SUGGESTED_LABELS.includes(l) || (!['Top Spot', 'Want to Go'].includes(l))
  );
  // Typed custom labels = not predefined, not suggested
  const customTypedLabels = selectedLabels.filter(
    (l) =>
      !['Top Spot', 'Want to Go'].includes(l) &&
      !SUGGESTED_LABELS.includes(l)
  );

  useEffect(() => {
    if (open) {
      setSelectedLabels(currentLabels);
      // If any custom labels exist, auto-check the custom checkbox
      const hasCustom = currentLabels.some(
        (l) => !['Top Spot', 'Want to Go'].includes(l)
      );
      setCustomChecked(hasCustom);
      setCustomInput('');
    }
  }, [open, currentLabels.join(',')]);

  const toggleLabel = (label) => {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const handleCustomCheck = (checked) => {
    setCustomChecked(checked);
    if (!checked) {
      // Remove all custom labels when unchecking
      setSelectedLabels((prev) =>
        prev.filter((l) => ['Top Spot', 'Want to Go'].includes(l))
      );
      setCustomInput('');
    }
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

  const handleSave = async () => {
    try {
      if (saved) {
        await updateLabels({ placeId, labels: selectedLabels });
        toast.success('Labels updated');
      } else {
        await saveSpot({ venue, labels: selectedLabels });
        toast.success(`${venue.name} added to Spots`);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className={cn('h-5 w-5', saved ? 'fill-red-500 text-red-500' : 'text-muted-foreground')} />
            {saved ? 'Edit Spot' : 'Save to Spots'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Venue preview */}
          <div className="flex gap-3 items-center rounded-lg border border-border bg-muted/30 p-3">
            {venue.image_urls?.[0] && (
              <img
                src={venue.image_urls[0]}
                alt={venue.name}
                className="h-12 w-12 rounded-md object-cover shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="font-medium text-sm text-foreground truncate">{venue.name}</p>
              <p className="text-xs text-muted-foreground truncate">{venue.address}</p>
            </div>
          </div>

          {/* Labels */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Labels</p>

            {/* Top Spot */}
            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
              <Checkbox
                checked={selectedLabels.includes('Top Spot')}
                onCheckedChange={() => toggleLabel('Top Spot')}
              />
              <Star className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Top Spot</span>
            </label>

            {/* Want to Go */}
            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
              <Checkbox
                checked={selectedLabels.includes('Want to Go')}
                onCheckedChange={() => toggleLabel('Want to Go')}
              />
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Want to Go</span>
            </label>

            {/* Custom Label */}
            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
              <Checkbox
                checked={customChecked}
                onCheckedChange={handleCustomCheck}
              />
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Custom Label</span>
            </label>

            {/* Expanded custom label section */}
            {customChecked && (
              <div className="rounded-lg bg-accent/30 p-3 space-y-3">
                {/* Custom typed labels (removable) */}
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

                {/* Suggested chips */}
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_LABELS.map((label) => {
                    const active = selectedLabels.includes(label);
                    return (
                      <button
                        key={label}
                        onClick={() => toggleLabel(label)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors border',
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-accent/50 text-accent-foreground border-transparent hover:bg-accent'
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Custom input */}
                <Input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Or type your own..."
                  className="h-8 text-xs bg-background"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? 'Saving...' : saved ? 'Update' : 'Save to Spots'}
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
