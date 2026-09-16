import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { removeVenue } from '@/lib/feedback';
import FeedbackSheet from '@/components/feedback/FeedbackSheet';
import { cn } from '@/lib/utils';

/**
 * Gear-icon overlay button that opens the general feedback sheet for a
 * venue (bug/feature/venue-issue/general, closed + open-ended). Admins
 * also get an inline "Remove venue" control via the sheet, which soft-hides
 * the venue from Feed/Search.
 */
export default function FeedbackTrigger({ venueId, venueName = null, className, onOpenChange }) {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  if (!venueId) return null;

  const handleOpenChange = (isOpen) => {
    setOpen(isOpen);
    onOpenChange?.(isOpen);
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Give feedback"
        onClick={() => handleOpenChange(true)}
        className={cn(
          'h-6 w-6 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors',
          className
        )}
      >
        <Settings className="h-3.5 w-3.5 text-foreground" />
      </button>
      <FeedbackSheet
        open={open}
        onOpenChange={handleOpenChange}
        venueId={venueId}
        venueName={venueName}
        isAdmin={isAdmin}
        onRemoveVenue={() => removeVenue(venueId)}
      />
    </div>
  );
}
