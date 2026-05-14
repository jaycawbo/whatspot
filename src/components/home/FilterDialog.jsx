import React, { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
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

const PRICE_LEVELS = ['$', '$$', '$$$', '$$$$'];

// Google Places type → display label (most common first, then alphabetical)
const CUISINE_TYPES = [
  { type: 'italian_restaurant',      label: 'Italian'          },
  { type: 'japanese_restaurant',     label: 'Japanese'         },
  { type: 'mexican_restaurant',      label: 'Mexican'          },
  { type: 'chinese_restaurant',      label: 'Chinese'          },
  { type: 'american_restaurant',     label: 'American'         },
  { type: 'thai_restaurant',         label: 'Thai'             },
  { type: 'indian_restaurant',       label: 'Indian'           },
  { type: 'korean_restaurant',       label: 'Korean'           },
  { type: 'mediterranean_restaurant',label: 'Mediterranean'    },
  { type: 'french_restaurant',       label: 'French'           },
  { type: 'vietnamese_restaurant',   label: 'Vietnamese'       },
  { type: 'middle_eastern_restaurant',label: 'Middle Eastern'  },
  { type: 'greek_restaurant',        label: 'Greek'            },
  { type: 'spanish_restaurant',      label: 'Spanish'          },
  { type: 'breakfast_restaurant',    label: 'Breakfast/Brunch' },
  { type: 'other',                   label: 'Other'            },
];

const DEFAULT_FILTERS = {
  openNow: false,
  priceLevels: [],
  cuisines: [],
  radius: 5,
  walkInOnly: false,
};

export default function FilterDialog({ filters, onFilterChange, open, onOpenChange }) {
  const [local, setLocal] = useState(filters);

  const handleOpen = (o) => {
    if (o) setLocal(filters);
    onOpenChange?.(o);
  };

  const togglePrice = (p) => {
    setLocal((prev) => ({
      ...prev,
      priceLevels: prev.priceLevels.includes(p)
        ? prev.priceLevels.filter((x) => x !== p)
        : [...prev.priceLevels, p],
    }));
  };

  const toggleCuisine = (type) => {
    setLocal((prev) => ({
      ...prev,
      cuisines: (prev.cuisines || []).includes(type)
        ? (prev.cuisines || []).filter((x) => x !== type)
        : [...(prev.cuisines || []), type],
    }));
  };

  const apply = () => {
    onFilterChange(local);
    onOpenChange?.(false);
  };

  const reset = () => {
    const resetFilters = { ...DEFAULT_FILTERS };
    setLocal(resetFilters);
    onFilterChange(resetFilters);
    onOpenChange?.(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto pb-8">
        <SheetHeader className="mb-4">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Open Now */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Open Now</span>
            <Switch
              checked={local.openNow}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, openNow: v }))}
            />
          </div>

          {/* Price Level */}
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

          {/* Cuisine Type */}
          <div>
            <span className="text-sm font-medium text-foreground">Cuisine Type</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {CUISINE_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => toggleCuisine(type)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    (local.cuisines || []).includes(type)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Radius */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Search Radius</span>
              <span className="text-xs text-muted-foreground">{local.radius} km</span>
            </div>
            <Slider
              value={[local.radius]}
              onValueChange={([v]) => setLocal((p) => ({ ...p, radius: v }))}
              min={0.5}
              max={25}
              step={0.5}
              className="mt-2"
            />
          </div>

          {/* Actions */}
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
