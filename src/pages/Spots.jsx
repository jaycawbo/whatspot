import React, { useState, useMemo } from 'react';
import Header from '@/components/home/Header';
import { useSpots } from '@/hooks/useSpots';
import { useGlobalState } from '@/context/GlobalStateContext';
import SpotCard from '@/components/spots/SpotCard';
import SpotsMapView from '@/components/spots/SpotsMapView';
import ShareListDialog from '@/components/spots/ShareListDialog';
import AuthModal from '@/components/auth/AuthModal';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { List, Map, Share2, Heart, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const DEFAULT_FILTERS = [
  { id: 'all', label: 'All Spots' },
  { id: 'Top Spot', label: 'Top Spots' },
  { id: 'Want to Go', label: 'Want to Go' },
  { id: 'custom', label: 'Custom Labels' },
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

export default function Spots() {
  const { spots, isLoading, removeSpot, isAuthenticated, allLabels } = useSpots();
  const { state } = useGlobalState();
  const [viewMode, setViewMode] = useState('list');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedCustomLabel, setSelectedCustomLabel] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Collect all unique custom labels from saved spots
  const existingCustomLabels = useMemo(() => {
    const custom = new Set();
    spots.forEach((s) => {
      s.labels?.forEach((l) => {
        if (!['Top Spot', 'Want to Go'].includes(l)) custom.add(l);
      });
    });
    return Array.from(custom);
  }, [spots]);

  // Merge suggested + existing for display
  const allCustomChips = useMemo(() => {
    const merged = [...SUGGESTED_LABELS];
    existingCustomLabels.forEach((l) => {
      if (!merged.includes(l)) merged.push(l);
    });
    return merged;
  }, [existingCustomLabels]);

  const handleFilterChange = (value) => {
    setActiveFilter(value);
    if (value !== 'custom') setSelectedCustomLabel(null);
  };

  const handleCustomChipClick = (label) => {
    setSelectedCustomLabel((prev) => (prev === label ? null : label));
  };

  const filteredSpots = useMemo(() => {
    if (activeFilter === 'all') return spots;
    if (activeFilter === 'custom') {
      if (selectedCustomLabel) {
        return spots.filter((s) => s.labels?.includes(selectedCustomLabel));
      }
      return spots.filter((s) =>
        s.labels?.some((l) => !['Top Spot', 'Want to Go'].includes(l))
      );
    }
    return spots.filter((s) => s.labels?.includes(activeFilter));
  }, [spots, activeFilter, selectedCustomLabel]);

  // Count for a custom chip
  const chipCount = (label) => spots.filter((s) => s.labels?.includes(label)).length;

  const handleRemove = async (placeId) => {
    try {
      await removeSpot(placeId);
      toast.success('Removed from Spots');
    } catch {
      toast.error('Failed to remove');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-14 px-4 md:px-8 lg:px-12 py-6 max-w-4xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Spots</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isAuthenticated
                ? `${spots.length} ${spots.length === 1 ? 'spot' : 'spots'} saved`
                : 'Sign in to see your saved spots'}
            </p>
          </div>
          {isAuthenticated && spots.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4 mr-1.5" />
              Share
            </Button>
          )}
        </div>

        {/* Not authenticated */}
        {!isAuthenticated && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Heart className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Sign in to see your Spots</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Save your favorite venues and access them anytime.
              </p>
            </div>
            <Button onClick={() => setAuthModalOpen(true)}>Sign in with Google</Button>
          </div>
        )}

        {/* Authenticated content */}
        {isAuthenticated && (
          <>
            {/* Filter tabs + view toggle */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="overflow-x-auto scrollbar-hide">
                <Tabs value={activeFilter} onValueChange={handleFilterChange}>
                  <TabsList>
                    {DEFAULT_FILTERS.map((f) => (
                      <TabsTrigger key={f.id} value={f.id} className="text-xs">
                        {f.label}
                        {f.id === 'all'
                          ? ` (${spots.length})`
                          : f.id === 'custom'
                          ? ` (${spots.filter((s) => s.labels?.some((l) => !['Top Spot', 'Want to Go'].includes(l))).length})`
                          : ` (${spots.filter((s) => s.labels?.includes(f.id)).length})`}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              <div className="flex gap-1">
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'map' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setViewMode('map')}
                >
                  <Map className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Custom Labels expanded section */}
            {activeFilter === 'custom' && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Filter by custom label:</p>
                <div className="flex flex-wrap gap-1.5">
                  {allCustomChips.map((label) => {
                    const count = chipCount(label);
                    const active = selectedCustomLabel === label;
                    return (
                      <button
                        key={label}
                        onClick={() => handleCustomChipClick(label)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors border',
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-accent/50 text-accent-foreground border-transparent hover:bg-accent'
                        )}
                      >
                        {label}{count > 0 ? ` (${count})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-border bg-card p-3 animate-pulse">
                    <div className="h-20 w-20 rounded-lg bg-muted shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 w-3/4 rounded bg-muted" />
                      <div className="h-3 w-1/2 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && filteredSpots.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <Heart className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">
                  {activeFilter === 'all'
                    ? 'No spots saved yet. Search for venues and tap the heart to save them!'
                    : selectedCustomLabel
                    ? `No spots with the "${selectedCustomLabel}" label.`
                    : `No spots with custom labels.`}
                </p>
              </div>
            )}

            {/* List view */}
            {!isLoading && viewMode === 'list' && filteredSpots.length > 0 && (
              <div className="space-y-3">
                {filteredSpots.map((spot) => (
                  <SpotCard key={spot.favoriteId} spot={spot} onRemove={handleRemove} />
                ))}
              </div>
            )}

            {/* Map view */}
            {!isLoading && viewMode === 'map' && filteredSpots.length > 0 && (
              <div className="h-[60vh] md:h-[70vh]">
                <SpotsMapView
                  spots={filteredSpots}
                  center={[state.userLocation.lat, state.userLocation.lon]}
                  onRemove={handleRemove}
                />
              </div>
            )}
          </>
        )}
      </div>

      <ShareListDialog open={shareOpen} onOpenChange={setShareOpen} />
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </div>
  );
}
