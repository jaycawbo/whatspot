import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

/**
 * Shared bottom-sheet filter UI used by both Feed/Search (via FilterDialog)
 * and Spots (via SpotsFilterBar). Callers configure which sections appear
 * and supply their own option lists so the two surfaces can diverge in
 * content (e.g. Spots has no Open Now) while sharing the same interaction
 * pattern (sheet, slider, switches, chip grids).
 */
export default function FilterSheet({
  open,
  onOpenChange,
  filters,
  defaultFilters,
  onApply,
  title = 'Filters',
  showOpenNow = false,
  showWalkInOnly = false,
  priceOptions = [],
  cuisineOptions = [],
  radius, // { min, max, step, label, unit, nullable }
}) {
  const [local, setLocal] = useState(filters);

  const handleOpen = (o) => {
    if (o) setLocal(filters);
    onOpenChange?.(o);
  };

  const togglePrice = (value) => {
    setLocal((prev) => ({
      ...prev,
      priceLevels: prev.priceLevels.includes(value)
        ? prev.priceLevels.filter((x) => x !== value)
        : [...prev.priceLevels, value],
    }));
  };

  const toggleCuisine = (value) => {
    setLocal((prev) => ({
      ...prev,
      cuisines: (prev.cuisines || []).includes(value)
        ? (prev.cuisines || []).filter((x) => x !== value)
        : [...(prev.cuisines || []), value],
    }));
  };

  const apply = () => {
    onApply(local);
    onOpenChange?.(false);
  };

  const reset = () => {
    setLocal(defaultFilters);
    onApply(defaultFilters);
    onOpenChange?.(false);
  };

  const radiusUnit = radius?.unit ?? 'km';
  const radiusActive = radius && local.radius !== null && local.radius !== undefined;

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-8">
        <SheetHeader className="mb-4">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {showOpenNow && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Open Now</span>
              <Switch
                checked={local.openNow}
                onCheckedChange={(v) => setLocal((p) => ({ ...p, openNow: v }))}
              />
            </div>
          )}

          {showWalkInOnly && (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-foreground">Walk-In Only</span>
                <p className="text-xs text-muted-foreground">Show venues accepting walk-in requests now</p>
              </div>
              <Switch
                checked={local.walkInOnly ?? false}
                onCheckedChange={(v) => setLocal((p) => ({ ...p, walkInOnly: v }))}
              />
            </div>
          )}

          {priceOptions.length > 0 && (
            <div>
              <span className="text-sm font-medium text-foreground">Price Level</span>
              <div className="flex gap-2 mt-2">
                {priceOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => togglePrice(value)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      local.priceLevels.includes(value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {cuisineOptions.length > 0 && (
            <div>
              <span className="text-sm font-medium text-foreground">Cuisine Type</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {cuisineOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => toggleCuisine(value)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      (local.cuisines || []).includes(value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {radius && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{radius.label ?? 'Distance'}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {radiusActive ? `${local.radius} ${radiusUnit}` : 'Any distance'}
                  </span>
                  {radius.nullable && (
                    <button
                      onClick={() =>
                        setLocal((p) => ({
                          ...p,
                          radius: radiusActive ? null : radius.min,
                        }))
                      }
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      {radiusActive ? 'Clear' : 'Set limit'}
                    </button>
                  )}
                </div>
              </div>
              {radiusActive && (
                <Slider
                  value={[local.radius]}
                  onValueChange={([v]) => setLocal((p) => ({ ...p, radius: v }))}
                  min={radius.min}
                  max={radius.max}
                  step={radius.step}
                  className="mt-2"
                />
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={apply} className="flex-1">
              Apply Filters
            </Button>
            <button
              onClick={reset}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset All
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
