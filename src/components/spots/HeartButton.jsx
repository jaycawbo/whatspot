import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpots } from '@/hooks/useSpots';
import SaveToSpotsDialog from './SaveToSpotsDialog';
import { toast } from 'sonner';

/**
 * Heart button for saving/unsaving a venue.
 * Shows filled heart when saved, opens SaveToSpotsDialog on click.
 */
export default function HeartButton({ venue, size = 'md', className }) {
  const { isSaved, isAuthenticated } = useSpots();
  const [dialogOpen, setDialogOpen] = useState(false);

  const placeId = venue?.place_id?.replace(/^places\//, '') || venue?.google_place_id;
  const saved = isSaved(placeId);

  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isAuthenticated) {
      toast.info('Sign in to save spots', {
        description: 'Create an account to build your personal Spots list.',
      });
      return;
    }
    setDialogOpen(true);
  };

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
    </>
  );
}
