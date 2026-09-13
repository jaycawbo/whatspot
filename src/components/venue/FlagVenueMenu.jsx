import React, { useState } from 'react';
import { Settings, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { flagVenue, removeVenue } from '@/lib/flagVenue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const FLAG_REASONS = [
  { value: 'wrong_category', label: 'Wrong category (not a restaurant/bar/cafe)' },
  { value: 'permanently_closed', label: 'Permanently closed' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
];

/**
 * Gear-icon overlay button + dropdown for reporting a venue that doesn't
 * belong on the platform. Admins (useAuth().isAdmin) also get an inline
 * "Remove venue" control that soft-hides it from Feed/Search.
 */
export default function FlagVenueMenu({ venueId, className }) {
  const { isAdmin } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  if (!venueId) return null;

  const handleFlag = async (reason) => {
    setSubmitting(true);
    const { error } = await flagVenue(venueId, reason);
    setSubmitting(false);
    toast(error ? 'Could not submit report' : "Thanks — we'll take a look.");
  };

  const handleRemove = async () => {
    setSubmitting(true);
    const { error } = await removeVenue(venueId);
    setSubmitting(false);
    toast(error ? 'Could not remove venue' : 'Venue removed');
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={submitting}
            aria-label="Report venue"
            className={cn(
              'h-6 w-6 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors',
              className
            )}
          >
            <Settings className="h-3.5 w-3.5 text-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {FLAG_REASONS.map((reason) => (
            <DropdownMenuItem key={reason.value} onClick={() => handleFlag(reason.value)}>
              {reason.label}
            </DropdownMenuItem>
          ))}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleRemove} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                Remove venue
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
