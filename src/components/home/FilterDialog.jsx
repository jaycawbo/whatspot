import React, { useState, useEffect } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

const PRICE_LEVELS = ['$', '$$', '$$$', '$$$$'];
const CUISINE_OPTIONS = [
  'Italian', 'Mexican', 'Thai', 'Japanese', 'Indian', 'French',
  'Chinese', 'Mediterranean', 'Korean', 'American', 'Spanish', 'Canadian',
];

export default function FilterDialog({ filters, onFilterChange, maxRadius = 10, externalOpen, onExternalOpenChange, hideTrigger }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (v) => {
    if (onExternalOpenChange) onExternalOpenChange(v);
    setInternalOpen(v);
  };

  const [local, setLocal] = useState(filters);

  const handleOpen = (o) => {
    if (o) setLocal(filters);
    setOpen(o);
  };

  const togglePrice = (p) => {
    setLocal((prev) => ({
      ...prev,
      priceLevels: prev.priceLevels.includes(p)
        ? prev.priceLevels.filter((x) => x !== p)
        : [...prev.priceLevels, p],
    }));
  };

  const toggleCuisine = (c) => {
    setLocal((prev) => ({
      ...prev,
      cuisines: prev.cuisines.includes(c)
        ? prev.cuisines.filter((x) => x !== c)
        : [...prev.cuisines, c],
    }));
  };

  const apply = () => {
    onFilterChange(local);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Filters</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Open Now */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Open Now</span>
            <Switch checked={local.openNow} onCheckedChange={(v) => setLocal((p) => ({ ...p, openNow: v }))} />
          </div>

          {/* Price */}
          <div>
            <span className="text-sm font-medium text-foreground">Price Level</span>
            <div className="flex gap-2 mt-2">
              {PRICE_LEVELS.map((p) => (
                <button
                  key={p}
                  onClick={() => togglePrice(p)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    local.priceLevels.includes(p)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Cuisine */}
          <div>
            <span className="text-sm font-medium text-foreground">Cuisine</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CUISINE_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleCuisine(c)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    local.cuisines.includes(c)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Radius */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Radius</span>
              <span className="text-xs text-muted-foreground">{local.radius} km</span>
            </div>
            <Slider
              value={[local.radius]}
              onValueChange={([v]) => setLocal((p) => ({ ...p, radius: v }))}
              min={1}
              max={maxRadius}
              step={0.5}
              className="mt-2"
            />
          </div>

          <Button onClick={apply} className="w-full">Apply Filters</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
