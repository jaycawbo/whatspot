import React, { useState, useMemo } from 'react';
import Header from '@/components/home/Header';
import { useSpots } from '@/hooks/useSpots';
import { useGlobalState } from '@/context/GlobalStateContext';
import SpotCard from '@/components/spots/SpotCard';
import SpotsMapView from '@/components/spots/SpotsMapView';
import ShareListDialog from '@/components/spots/ShareListDialog';
import AuthModal from '@/components/auth/AuthModal';
import { Button } from '@/components/ui/button';
import { List, Map, Share2, Heart, X, Plus, Search } from 'lucide-react';
import LabelSearchBar from '@/components/spots/LabelSearchBar';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const BUILT_IN_FILTERS = ['all', 'Top Spot', 'Want to Go'];

const SUGGESTED_LABELS = [
  'Special Occasion', 'Date Night', 'Business Meal', 'Hidden Gem',
  'Best Cocktails', 'Good for Groups', 'Neighbourhood Gem',
  'Underrated', 'Worth the Wait', 'Would Not Go Back',
];

export default function Spots() {
  const { spots, isLoading, removeSpot, isAuthenticated, allLabels } = useSpots();
  const { state } = useGlobalState();
  const [viewMode, setViewMode] = useState('list');
  const [activeFilter, setActiveFilter] = useState('all');
  const [customLabelPickerOpen, setCustomLabelPickerOpen] = useState(false);
  const [pinnedLabels, setPinnedLabels] = useState([]);
  const [customInput, setCustomInput] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [labelSearchOpen, setLabelSearchOpen] = useState(false);
  const [labelSearchResults, setLabelSearchResults] = useState(null);

  // All unique custom labels from saved spots
  const existingCustomLabels = useMemo(() => {
    const custom = new Set();
    spots.forEach((s) => {
      s.labels?.forEach((l) => {
        if (!['Top Spot', 'Want to Go'].includes(l)) custom.add(l);
      });
    });
    return Array.from(custom);
  }, [spots]);

  // Labels pinned to tab bar (union of pinned + those that exist on spots)
  const visibleCustomTabs = useMemo(() => {
    const merged = new Set([...pinnedLabels, ...existingCustomLabels]);
    return Array.from(merged);
  }, [pinnedLabels, existingCustomLabels]);

  // All chips for the picker (suggested + any existing not in suggested)
  const allChips = useMemo(() => {
    const merged = [...SUGGESTED_LABELS];
    existingCustomLabels.forEach((l) => {
      if (!merged.includes(l)) merged.push(l);
    });
    pinnedLabels.forEach((l) => {
      if (!merged.includes(l)) merged.push(l);
    });
    return merged;
  }, [existingCustomLabels, pinnedLabels]);

  const addLabelToTabs = (label) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (!pinnedLabels.includes(trimmed)) {
      setPinnedLabels((prev) => [...prev, trimmed]);
    }
    setActiveFilter(trimmed);
    setCustomLabelPickerOpen(false);
    setCustomInput('');
  };

  const removePinnedLabel = (label) => {
    setPinnedLabels((prev) => prev.filter((l) => l !== label));
    if (activeFilter === label) setActiveFilter('all');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLabelToTabs(customInput);
    }
  };

  const filteredSpots = useMemo(() => {
    if (activeFilter === 'all') return spots;
    return spots.filter((s) => s.labels?.includes(activeFilter));
  }, [spots, activeFilter]);

  const spotCount = (label) => spots.filter((s) => s.labels?.includes(label)).length;

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
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-1.5 pb-1">
                  {/* Built-in tabs */}
                  {[
                    { id: 'all', label: 'All Spots' },
                    { id: 'Top Spot', label: 'Top Spots' },
                    { id: 'Want to Go', label: 'Want to Go' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => { setActiveFilter(f.id); setCustomLabelPickerOpen(false); setLabelSearchOpen(false); setLabelSearchResults(null); }}
                      className={cn(
                        'shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                        activeFilter === f.id
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                      )}
                    >
                      {f.label} ({f.id === 'all' ? spots.length : spotCount(f.id)})
                    </button>
                  ))}

                  {/* Custom label tabs */}
                  {visibleCustomTabs.map((label) => (
                    <span
                      key={label}
                      className={cn(
                        'shrink-0 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap group',
                        activeFilter === label
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                      )}
                    >
                      <button onClick={() => { setActiveFilter(label); setCustomLabelPickerOpen(false); setLabelSearchOpen(false); setLabelSearchResults(null); }}>
                        {label} ({spotCount(label)})
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); removePinnedLabel(label); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}

                  {/* Add custom label button */}
                  <button
                    onClick={() => setCustomLabelPickerOpen((prev) => !prev)}
                    className={cn(
                      'shrink-0 rounded-md p-1.5 transition-colors',
                      customLabelPickerOpen
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    )}
                    title="Add custom label filter"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex gap-1 shrink-0">
                <Button
                  variant={labelSearchOpen ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setLabelSearchOpen((prev) => !prev);
                    if (labelSearchOpen) setLabelSearchResults(null);
                  }}
                  title="Search by label"
                >
                  <Search className="h-4 w-4" />
                </Button>
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

            {/* Label search bar */}
            {labelSearchOpen && (
              <LabelSearchBar
                allLabels={allLabels}
                spots={spots}
                onResults={setLabelSearchResults}
                onClose={() => { setLabelSearchOpen(false); setLabelSearchResults(null); }}
              />
            )}

            {/* Custom label picker */}
            {customLabelPickerOpen && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Select or create a label filter:</p>
                <div className="flex flex-wrap gap-1.5">
                  {allChips.map((label) => {
                    const isPinned = visibleCustomTabs.includes(label);
                    return (
                      <button
                        key={label}
                        onClick={() => addLabelToTabs(label)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors border',
                          isPinned
                            ? 'bg-primary/20 text-primary border-primary/30'
                            : 'bg-accent/50 text-accent-foreground border-transparent hover:bg-accent'
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a custom label..."
                    className="h-8 text-xs bg-background flex-1"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() => addLabelToTabs(customInput)}
                    disabled={!customInput.trim()}
                  >
                    Add
                  </Button>
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
            {!isLoading && displaySpots.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <Heart className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">
                  {labelSearchResults !== null
                    ? 'No venues match all selected labels.'
                    : activeFilter === 'all'
                    ? 'No spots saved yet. Search for venues and tap the heart to save them!'
                    : `No spots with the "${activeFilter}" label.`}
                </p>
              </div>
            )}

            {/* List view */}
            {!isLoading && viewMode === 'list' && displaySpots.length > 0 && (
              <div className="space-y-3">
                {displaySpots.map((spot) => (
                  <SpotCard key={spot.favoriteId} spot={spot} onRemove={handleRemove} />
                ))}
              </div>
            )}

            {/* Map view */}
            {!isLoading && viewMode === 'map' && displaySpots.length > 0 && (
              <div className="h-[60vh] md:h-[70vh]">
                <SpotsMapView
                  spots={displaySpots}
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
