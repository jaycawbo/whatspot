import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '@/components/home/Header';
import { useSpots } from '@/hooks/useSpots';
import { useGlobalState } from '@/context/GlobalStateContext';
import SpotCard from '@/components/spots/SpotCard';
import SpotsMapView from '@/components/spots/SpotsMapView';
import ShareListDialog from '@/components/spots/ShareListDialog';
import AuthModal from '@/components/auth/AuthModal';
import { Button } from '@/components/ui/button';
import { List, Map, Share2, Heart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Standard filters — single-select, always visible
const STANDARD_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'Want to Go', label: 'Want to Go' },
  { id: 'Favourite', label: 'Favourites' },
  { id: "I'll Pass", label: "I'll Pass" },
  { id: 'Viewed', label: 'Viewed' },
];

// TODO: label priority logic should be enforced at the database level
// when the backend interactions table is wired up

export default function Spots() {
  const { spots, isLoading, removeSpot, isAuthenticated } = useSpots();
  const { state } = useGlobalState();
  const [viewMode, setViewMode] = useState('list');
  const [activeStandardFilter, setActiveStandardFilter] = useState('all');
  const [activeDynamicTags, setActiveDynamicTags] = useState([]);
  const [dynamicTags, setDynamicTags] = useState([]);
  const [dynamicTagsLoading, setDynamicTagsLoading] = useState(false);
  const [dynamicTagsCache, setDynamicTagsCache] = useState({ count: 0, tags: [] });
  const [shareOpen, setShareOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Fetch dynamic tags from edge function
  const fetchDynamicTags = useCallback(async () => {
    if (!isAuthenticated || spots.length < 10) {
      setDynamicTags([]);
      return;
    }

    // Check cache — invalidate only when spot count changes
    if (dynamicTagsCache.count === spots.length && dynamicTagsCache.tags.length > 0) {
      setDynamicTags(dynamicTagsCache.tags);
      return;
    }

    setDynamicTagsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-spots-tags');
      if (error) throw error;
      const tags = data?.tags || [];
      setDynamicTags(tags);
      setDynamicTagsCache({ count: spots.length, tags });
    } catch (err) {
      console.error('Failed to fetch dynamic tags:', err);
      setDynamicTags([]);
    } finally {
      setDynamicTagsLoading(false);
    }
  }, [isAuthenticated, spots.length, dynamicTagsCache.count, dynamicTagsCache.tags.length]);

  useEffect(() => {
    fetchDynamicTags();
  }, [fetchDynamicTags]);

  // Standard filter: single-select
  const handleStandardFilter = useCallback((filterId) => {
    setActiveStandardFilter(filterId);
    // Keep active dynamic tags when switching standard filter
  }, []);

  // Dynamic tag: multi-select toggle
  const handleDynamicTagToggle = useCallback((tagLabel) => {
    setActiveDynamicTags((prev) =>
      prev.includes(tagLabel)
        ? prev.filter((t) => t !== tagLabel)
        : [...prev, tagLabel]
    );
  }, []);

  // Filter spots: standard filter AND dynamic tags (AND logic)
  const filteredSpots = useMemo(() => {
    let result = spots;

    // Apply standard filter
    if (activeStandardFilter !== 'all') {
      result = result.filter((s) => s.labels?.includes(activeStandardFilter));
    }

    // Apply dynamic tags (AND — venue must match ALL active tags)
    if (activeDynamicTags.length > 0) {
      result = result.filter((spot) => {
        return activeDynamicTags.every((tag) => {
          // Check if tag matches address (geographic) or category (venue type)
          const addressMatch = spot.address?.includes(tag);
          const categoryMatch = spot.category
            ?.replace(/_/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()) === tag;
          return addressMatch || categoryMatch;
        });
      });
    }

    return result;
  }, [spots, activeStandardFilter, activeDynamicTags]);

  const spotCount = (label) =>
    label === 'all' ? spots.length : spots.filter((s) => s.labels?.includes(label)).length;

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
            {/* Filter bar */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-1.5 pb-1 flex-wrap">
                  {/* Standard filters — single-select */}
                  {STANDARD_FILTERS.map((f) => {
                    const count = spotCount(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => handleStandardFilter(f.id)}
                        className={cn(
                          'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap border',
                          activeStandardFilter === f.id
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'text-muted-foreground border-border hover:text-foreground hover:bg-accent'
                        )}
                      >
                        {f.label} {f.id !== 'all' ? `(${count})` : `(${spots.length})`}
                      </button>
                    );
                  })}

                  {/* Separator between standard and dynamic */}
                  {dynamicTags.length > 0 && (
                    <div className="h-4 w-px bg-border shrink-0 mx-1" />
                  )}

                  {/* Dynamic tags — multi-select */}
                  {dynamicTags.map((tag) => {
                    const active = activeDynamicTags.includes(tag.label);
                    return (
                      <button
                        key={tag.label}
                        onClick={() => handleDynamicTagToggle(tag.label)}
                        className={cn(
                          'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap border',
                          active
                            ? 'bg-secondary text-secondary-foreground border-secondary'
                            : 'text-muted-foreground border-border hover:text-foreground hover:bg-accent'
                        )}
                      >
                        {tag.label} ({tag.count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* View toggle */}
              <div className="flex gap-1 shrink-0">
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
                  {activeStandardFilter === 'all' && activeDynamicTags.length === 0
                    ? 'No spots saved yet. Search for venues and swipe right to save them!'
                    : 'No spots match the selected filters.'}
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
