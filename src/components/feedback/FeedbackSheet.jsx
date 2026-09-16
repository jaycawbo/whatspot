import React, { useEffect, useState } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FEEDBACK_CATEGORIES, CLOSED_OPTIONS, submitFeedback } from '@/lib/feedback';

const STEPS = { CATEGORY: 'category', DETAILS: 'details' };

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-muted-foreground hover:bg-accent'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Two-step "give feedback" sheet: category picker (no default/preselection)
 * -> closed-ended chips for that category + an always-visible free-text box.
 * Used both venue-scoped (venueId set) and venue-agnostic (venueId null,
 * "Venue issue" hidden from the category list).
 */
export default function FeedbackSheet({
  open,
  onOpenChange,
  venueId = null,
  venueName = null,
  isAdmin = false,
  onRemoveVenue = null,
}) {
  const [step, setStep] = useState(STEPS.CATEGORY);
  const [category, setCategory] = useState(null);
  const [closedReason, setClosedReason] = useState(null);
  const [openText, setOpenText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingVenue, setRemovingVenue] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(STEPS.CATEGORY);
      setCategory(null);
      setClosedReason(null);
      setOpenText('');
    }
  }, [open]);

  const categories = FEEDBACK_CATEGORIES.filter((c) => !c.requiresVenue || venueId);

  const handlePickCategory = (value) => {
    setCategory(value);
    setClosedReason(null);
    setStep(STEPS.DETAILS);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const { error } = await submitFeedback({ category, closedReason, openText, venueId });
    setSubmitting(false);
    if (error) {
      toast('Could not submit feedback');
      return;
    }
    toast("Thanks — we'll take a look.");
    onOpenChange(false);
  };

  const handleRemoveVenue = async () => {
    if (!onRemoveVenue) return;
    setRemovingVenue(true);
    const { error } = await onRemoveVenue();
    setRemovingVenue(false);
    toast(error ? 'Could not remove venue' : 'Venue removed');
    if (!error) onOpenChange(false);
  };

  const canSubmit = !submitting && !!closedReason && (closedReason !== 'other' || openText.trim().length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-8">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {step === STEPS.DETAILS && (
              <button
                type="button"
                onClick={() => setStep(STEPS.CATEGORY)}
                aria-label="Back"
                className="-ml-1 flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <SheetTitle>{step === STEPS.CATEGORY ? 'Give feedback' : 'Tell us more'}</SheetTitle>
          </div>
          {venueName && <p className="text-sm text-muted-foreground">{venueName}</p>}
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {step === STEPS.CATEGORY ? (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Chip key={c.value} active={category === c.value} onClick={() => handlePickCategory(c.value)}>
                  {c.label}
                </Chip>
              ))}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {CLOSED_OPTIONS[category].map((o) => (
                  <Chip key={o.value} active={closedReason === o.value} onClick={() => setClosedReason(o.value)}>
                    {o.label}
                  </Chip>
                ))}
              </div>
              <Textarea
                value={openText}
                onChange={(e) => setOpenText(e.target.value)}
                placeholder="Tell us more (required if you picked Other)"
                rows={4}
              />
              <Button className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
                {submitting ? 'Submitting…' : 'Submit'}
              </Button>
            </>
          )}

          {venueId && isAdmin && onRemoveVenue && (
            <button
              type="button"
              onClick={handleRemoveVenue}
              disabled={removingVenue}
              className="flex items-center gap-2 text-sm text-destructive hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove venue
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
