import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/home/Header';
import SpotListsSection from '@/components/bronco/SpotListsSection';
import { useSpots } from '@/hooks/useSpots';
import { useUserLabels } from '@/hooks/useUserLabels';
import { useGlobalState } from '@/context/GlobalStateContext';
import SpotCard from '@/components/spots/SpotCard';
import SpotsMapView from '@/components/spots/SpotsMapView';
import SpotsFilterBar from '@/components/spots/SpotsFilterBar';
import SpotsMoveDialog from '@/components/spots/SpotsMoveDialog';
import ShareListDialog from '@/components/spots/ShareListDialog';
import ImportListDialog from '@/components/spots/ImportListDialog';
import AuthModal from '@/components/auth/AuthModal';
import { Button } from '@/components/ui/button';
import { List, Map, Share2, Upload, Heart, ChevronDown, ChevronUp, Tag, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { haversineKm } from '@/lib/geo';

// ─── List definitions ───────────────────────────────────────────────────────

const VISIBLE_LISTS = ['Favourites', 'Interested'];
const HIDDEN_LISTS  = ['Been To', 'Not Interested', "Didn't Like It"];

const LIST_MATCHER = {
  Favourites:       (s) => s.interactionType === 'rated' && s.rating === 'loved',
  Interested:       (s) => s.interactionType === 'interested',
  'Been To':        (s) => s.interactionType === 'rated' && s.rating === 'liked',
  'Not Interested': (s) => s.interactionType === 'not_interested',
  "Didn't Like It": (s) => s.interactionType === 'rated' && s.rating === 'disliked',
};

const EMPTY_STATES = {
  Favourites:       'Venues you love will appear here.',
  Interested:       'Swipe right on venues you want to explore.',
  'Been To':        'Rate a venue after visiting — it will appear here.',
  'Not Interested': 'Swipe left on venues that aren\'t for you.',
  "Didn't Like It": 'Rate a venue 👎 after visiting — it will appear here.',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function humanizeCategory(cat) {
  return (cat || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/ Restaurant$/, '')
    .trim();
}

// ─── Note editing dialog ─────────────────────────────────────────────────────

function NoteDialog({ spot, onSave, onClose }) {
  const [value, setValue] = useState(spot?.notes || '');
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base truncate">{spot?.name}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 350))}
          placeholder="Add a personal note... (optional)"
          rows={4}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground text-right">{value.length}/350</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(value)}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Spots() {
  const { spots, isLoading, removeSpot, moveToList, updateNote, saveSpot, isAuthenticated } = useSpots();
  const { labelsByVenue, getVenueLabels, userLabels } = useUserLabels();
  const { user } = useAuth();
  const { state } = useGlobalState();

  // ── List navigation ──
  const [activeList, setActiveList] = useState('Favourites');
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');

  // ── Label filter ──
  const [activeLabelId, setActiveLabelId] = useState(null); // null = All

  // ── Filter bar ──
  const [filters, setFilters] = useState({
    openNow: false,
    priceLevels: [],
    cuisines: [],
    maxDistanceKm: null,
  });

  // ── View ──
  const [viewMode, setViewMode] = useState('list');

  // ── Edit mode ──
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ── Dialogs ──
  const [moveDialogSpot, setMoveDialogSpot] = useState(null); // { placeId, currentList }
  const [noteDialogSpot, setNoteDialogSpot] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Reset filters/search/labels when active list changes
  useEffect(() => {
    setSearchQuery('');
    setActiveLabelId(null);
    setFilters({ openNow: false, priceLevels: [], cuisines: [], maxDistanceKm: null });
    setSelectedIds(new Set());
    setIsEditMode(false);
  }, [activeList]);

  // All spots for the active list
  const listSpots = useMemo(() => {
    const matcher = LIST_MATCHER[activeList];
    return matcher ? spots.filter(matcher) : [];
  }, [spots, activeList]);

  // Available cuisines in current list
  const availableCuisines = useMemo(() => {
    const cats = new Set();
    listSpots.forEach((s) => { if (s.category) cats.add(s.category); });
    return [...cats].sort();
  }, [listSpots]);

  // Auto-labels derived from list venues (top 8 by count)
  const autoLabels = useMemo(() => {
    const counts = {};
    listSpots.forEach((s) => {
      if (s.category) {
        counts[s.category] = (counts[s.category] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([key, count]) => ({ key, label: humanizeCategory(key), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [listSpots]);

  // User labels that appear on at least one venue in the current list
  const listUserLabels = useMemo(() => {
    const listVenueIds = new Set(listSpots.map((s) => s.google_place_id));
    const labelIds = new Set();
    listSpots.forEach((s) => {
      getVenueLabels(s.google_place_id).forEach((l) => labelIds.add(l.id));
    });
    return userLabels.filter((l) => labelIds.has(l.id));
  }, [listSpots, userLabels, getVenueLabels]);

  // Apply all filters to listSpots
  const filteredSpots = useMemo(() => {
    let result = listSpots;
    const userLoc = state.userLocation;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) =>
        s.name?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q)
      );
    }

    // Label filter (auto or user)
    if (activeLabelId) {
      // Could be an auto-label key (category string) or user label id (uuid)
      const autoMatch = autoLabels.find((a) => a.key === activeLabelId);
      if (autoMatch) {
        result = result.filter((s) => s.category === activeLabelId);
      } else {
        // User label
        result = result.filter((s) =>
          getVenueLabels(s.google_place_id).some((l) => l.id === activeLabelId)
        );
      }
    }

    // Price (normalise to number to guard against DB returning strings)
    if (filters.priceLevels.length > 0) {
      result = result.filter((s) => s.price_level != null && filters.priceLevels.includes(Number(s.price_level)));
    }

    // Cuisine
    if (filters.cuisines.length > 0) {
      result = result.filter((s) => filters.cuisines.includes(s.category));
    }

    // Distance (requires userLocation — handle both lon and lng field names)
    const userLon = userLoc?.lon ?? userLoc?.lng;
    if (filters.maxDistanceKm !== null && userLoc?.lat && userLon) {
      result = result.filter((s) => {
        if (!s.lat || !s.lng) return true; // keep if no coords
        const dist = haversineKm(userLoc.lat, userLon, s.lat, s.lng);
        return dist <= filters.maxDistanceKm;
      });
    }

    return result;
  }, [listSpots, searchQuery, activeLabelId, filters, autoLabels, getVenueLabels, state.userLocation]);

  // ── Handlers ──

  const handleSwitchList = (list) => {
    setActiveList(list);
    if (VISIBLE_LISTS.includes(list)) {
      // Don't collapse hidden panel when clicking a visible tab
    }
  };

  const handleRemove = async (placeId) => {
    try {
      await removeSpot(placeId);
      toast.success('Removed from Spots');
    } catch {
      toast.error('Failed to remove');
    }
  };

  const handleMoveToList = async (placeId, listName) => {
    try {
      await moveToList({ placeId, listName });
      toast.success(`Moved to ${listName}`);
    } catch {
      toast.error('Failed to move');
    }
  };

  const handleSaveNote = async (value) => {
    if (!noteDialogSpot) return;
    try {
      await updateNote({ placeId: noteDialogSpot.google_place_id, notes: value || null });
      toast.success('Note saved');
    } catch {
      toast.error('Failed to save note');
    }
    setNoteDialogSpot(null);
  };

  const handleToggleSelect = (placeId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(placeId) ? next.delete(placeId) : next.add(placeId);
      return next;
    });
  };

  const handleBulkMove = async (listName) => {
    try {
      await Promise.all([...selectedIds].map((placeId) => moveToList({ placeId, listName })));
      toast.success(`Moved ${selectedIds.size} venue${selectedIds.size > 1 ? 's' : ''} to ${listName}`);
    } catch {
      toast.error('Failed to move some venues');
    }
    setSelectedIds(new Set());
    setIsEditMode(false);
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all([...selectedIds].map((placeId) => removeSpot(placeId)));
      toast.success(`Deleted ${selectedIds.size} venue${selectedIds.size > 1 ? 's' : ''}`);
    } catch {
      toast.error('Failed to delete some venues');
    }
    setSelectedIds(new Set());
    setIsEditMode(false);
  };

  const hasActiveFilters = filters.openNow || filters.priceLevels.length > 0 || filters.cuisines.length > 0 || filters.maxDistanceKm !== null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="pt-14 px-4 md:px-8 lg:px-12 py-6 max-w-4xl mx-auto space-y-4">

        {/* Bronco: custom named spot lists with live availability */}
        <SpotListsSection />

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Spots</h1>
            {isAuthenticated && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {spots.length} {spots.length === 1 ? 'spot' : 'spots'} saved
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-1.5" />
                Import
              </Button>
            )}
            {isAuthenticated && spots.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
                <Share2 className="h-4 w-4 mr-1.5" />
                Share
              </Button>
            )}
            {isAuthenticated && listSpots.length > 0 && (
              <Button
                variant={isEditMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setIsEditMode((v) => !v);
                  setSelectedIds(new Set());
                }}
              >
                {isEditMode ? 'Done' : 'Edit'}
              </Button>
            )}
          </div>
        </div>

        {/* Unauthenticated */}
        {!isAuthenticated && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Heart className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Sign in to save and view your Spots</h2>
              <p className="text-sm text-muted-foreground mt-1">Keep track of everywhere you've been and want to go.</p>
            </div>
            <Button onClick={() => setAuthModalOpen(true)}>Sign in with Google</Button>
          </div>
        )}

        {isAuthenticated && (
          <>
            {/* ── Search bar ── */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search within ${activeList}...`}
                className="w-full rounded-xl border border-border bg-background pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* ── List tabs ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                {VISIBLE_LISTS.map((list) => (
                  <button
                    key={list}
                    onClick={() => handleSwitchList(list)}
                    className={cn(
                      'rounded-full px-4 py-1.5 text-sm font-medium transition-colors border',
                      activeList === list
                        ? 'bg-foreground text-background border-foreground'
                        : 'text-muted-foreground border-border hover:text-foreground hover:bg-accent'
                    )}
                  >
                    {list}
                  </button>
                ))}

                <button
                  onClick={() => setHiddenExpanded((v) => !v)}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all lists
                  {hiddenExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>

              {/* Hidden lists row */}
              {hiddenExpanded && (
                <div className="flex items-center gap-1.5 pl-0.5">
                  {HIDDEN_LISTS.map((list) => (
                    <button
                      key={list}
                      onClick={() => handleSwitchList(list)}
                      className={cn(
                        'rounded-full px-4 py-1.5 text-sm font-medium transition-colors border',
                        activeList === list
                          ? 'bg-foreground text-background border-foreground'
                          : 'text-muted-foreground border-border hover:text-foreground hover:bg-accent'
                      )}
                    >
                      {list}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Label filter row ── */}
            {(autoLabels.length > 0 || listUserLabels.length > 0) && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                {/* All chip */}
                <button
                  onClick={() => setActiveLabelId(null)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                    activeLabelId === null
                      ? 'bg-foreground text-background border-foreground'
                      : 'text-muted-foreground border-border hover:text-foreground hover:bg-accent'
                  )}
                >
                  All
                </button>

                {/* Auto-labels */}
                {autoLabels.map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setActiveLabelId(activeLabelId === key ? null : key)}
                    className={cn(
                      'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap',
                      activeLabelId === key
                        ? 'bg-foreground text-background border-foreground'
                        : 'text-muted-foreground border-border hover:text-foreground hover:bg-accent'
                    )}
                  >
                    {label} ({count})
                  </button>
                ))}

                {/* Divider between auto and user labels */}
                {autoLabels.length > 0 && listUserLabels.length > 0 && (
                  <div className="h-5 w-px bg-border shrink-0 self-center mx-0.5" />
                )}

                {/* User-created labels */}
                {listUserLabels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => setActiveLabelId(activeLabelId === label.id ? null : label.id)}
                    className={cn(
                      'shrink-0 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap',
                      activeLabelId === label.id
                        ? 'bg-foreground text-background border-foreground'
                        : 'text-muted-foreground border-dashed border-border hover:text-foreground hover:bg-accent'
                    )}
                  >
                    <Tag className="h-3 w-3" />
                    {label.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Filter bar ── */}
            <SpotsFilterBar
              filters={filters}
              onChange={setFilters}
              availableCuisines={availableCuisines}
            />

            {/* ── Toolbar: Map/List toggle (left-aligned) ── */}
            <div className="flex items-center gap-1">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('list')}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'map' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('map')}
                aria-label="Map view"
              >
                <Map className="h-4 w-4" />
              </Button>
              {filteredSpots.length > 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  {filteredSpots.length} {filteredSpots.length === 1 ? 'venue' : 'venues'}
                </span>
              )}
            </div>

            {/* ── Loading skeleton ── */}
            {isLoading && (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
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

            {/* ── Empty state ── */}
            {!isLoading && filteredSpots.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <Heart className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm max-w-xs">
                  {searchQuery || activeLabelId || hasActiveFilters
                    ? 'No venues match your current filters.'
                    : EMPTY_STATES[activeList]}
                </p>
              </div>
            )}

            {/* ── List view ── */}
            {!isLoading && viewMode === 'list' && filteredSpots.length > 0 && (
              <div className="space-y-3">
                {filteredSpots.map((spot) => (
                  <SpotCard
                    key={spot.favoriteId}
                    spot={spot}
                    onRemove={handleRemove}
                    onMoveToList={(placeId, listName) => handleMoveToList(placeId, listName)}
                    onEditNote={(s) => setNoteDialogSpot(s)}
                    isEditMode={isEditMode}
                    isSelected={selectedIds.has(spot.google_place_id)}
                    onToggleSelect={handleToggleSelect}
                  />
                ))}
              </div>
            )}

            {/* ── Map view ── */}
            {!isLoading && viewMode === 'map' && filteredSpots.length > 0 && (
              <div className="h-[60vh] md:h-[70vh]">
                <SpotsMapView
                  spots={filteredSpots}
                  center={[state.userLocation?.lat ?? 43.6532, state.userLocation?.lon ?? -79.3832]}
                  onRemove={handleRemove}
                />
              </div>
            )}

            {/* ── Edit mode bottom bar ── */}
            {isEditMode && selectedIds.size > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-3">
                <span className="text-sm text-muted-foreground flex-1">
                  {selectedIds.size} selected
                </span>
                <SpotsMoveDialog
                  open={false}
                  onOpenChange={() => {}}
                  currentList={activeList}
                  onMove={handleBulkMove}
                  trigger={
                    <Button variant="outline" size="sm">Move to...</Button>
                  }
                />
                {/* Inline move dropdown for edit bar */}
                <div className="relative">
                  <select
                    className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) handleBulkMove(e.target.value); }}
                  >
                    <option value="" disabled>Move to...</option>
                    {['Favourites', 'Interested', 'Been To', 'Not Interested', "Didn't Like It"]
                      .filter((l) => l !== activeList)
                      .map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  Delete
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Dialogs ── */}
      <ShareListDialog open={shareOpen} onOpenChange={setShareOpen} />
      <ImportListDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingSpots={spots}
        onSaveVenue={(venue) => saveSpot({ venue, labels: ['Interested'] })}
      />
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />

      {noteDialogSpot && (
        <NoteDialog
          spot={noteDialogSpot}
          onSave={handleSaveNote}
          onClose={() => setNoteDialogSpot(null)}
        />
      )}
    </div>
  );
}
