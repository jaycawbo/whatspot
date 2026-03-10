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
import { Heart, Trash2, Star, Tag } from 'lucide-react';
import { useSpots } from '@/hooks/useSpots';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const PREDEFINED_LABELS = [
  { id: 'top-spot', label: 'Top Spot', icon: Star },
  { id: 'want-to-go', label: 'Want to Go', icon: Tag },
];

export default function SaveToSpotsDialog({ open, onOpenChange, venue }) {
  const { isSaved, getLabels, saveSpot, removeSpot, updateLabels, isSaving, isRemoving } = useSpots();

  const placeId = venue?.place_id?.replace(/^places\//, '') || venue?.google_place_id;
  const saved = isSaved(placeId);
  const currentLabels = getLabels(placeId);

  const [selectedLabels, setSelectedLabels] = useState([]);

  useEffect(() => {
    if (open) {
      setSelectedLabels(currentLabels);
    }
  }, [open, currentLabels.join(',')]);

  const toggleLabel = (label) => {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  const handleSave = async () => {
    try {
      if (saved) {
        // Update labels
        await updateLabels({ placeId, labels: selectedLabels });
        toast.success('Labels updated');
      } else {
        // Add to spots
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
            {PREDEFINED_LABELS.map(({ id, label, icon: Icon }) => (
              <label
                key={id}
                className="flex items-center gap-3 cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={selectedLabels.includes(label)}
                  onCheckedChange={() => toggleLabel(label)}
                />
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? 'Saving...' : saved ? 'Update Labels' : 'Save to Spots'}
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
