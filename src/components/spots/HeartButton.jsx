import React, { useState, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpots } from '@/hooks/useSpots';
import SaveToSpotsDialog from './SaveToSpotsDialog';
import AuthModal from '@/components/auth/AuthModal';
import { toast } from 'sonner';

/**
 * Heart button for saving/unsaving a venue.
 * When used in the discovery feed, directly saves as "Favourite" (label hierarchy: Favourite supersedes all).
 * When already saved, opens SaveToSpotsDialog for label editing.
 */
export default function HeartButton({ venue, size = 'md', className, directFavourite = false, onFavouriteAdvance }) {
  const { isSaved, isAuthenticated, saveOrUpdateLabel } = useSpots();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const placeId = venue?.place_id?.replace(/^places\//, '') || venue?.google_place_id;
  const saved = isSaved(placeId);

  const handleClick = useCallback(async (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    if (directFavourite) {
      // Discovery card heart: save directly as Favourite
      try {
        await saveOrUpdateLabel({ venue, label: 'Favourite' });
        // TODO: wire to user_interactions table
        console.log('[TODO: wire to backend]', {
          event: 'venue_favourited',
          venue_id: placeId,
          timestamp: Date.now(),
        });
        toast.success('Saved to Favourites');
        // Trigger card advance after brief delay
        onFavouriteAdvance?.();
      } catch (err) {
        console.error('Failed to favourite:', err);
        toast.error('Failed to save');
      }
    } else {
      // Standard heart: open dialog for label editing
      setDialogOpen(true);
    }
  }, [isAuthenticated, directFavourite, venue, placeId, saveOrUpdateLabel]);

  const sizeClasses = {
    sm: 'h-7 w-7',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={cn(
          'flex items-center justify-center rounded-full bg-background/80 backdrop-blur-sm shadow-md hover:bg-background transition-all',
          sizeClasses[size],
          className
        )}
        aria-label={saved ? 'Remove from spots' : 'Save to spots'}
      >
        <Heart
          className={cn(
            iconSizes[size],
            'transition-colors',
            saved ? 'fill-red-500 text-red-500' : 'text-muted-foreground hover:text-foreground'
          )}
        />
      </button>

      <SaveToSpotsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        venue={venue}
      />

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
      />
    </>
  );
}
