import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { useBroncoSpotLists } from '@/hooks/useBroncoSpotLists';
import { useSpots } from '@/hooks/useSpots';
import { useUserLabels } from '@/hooks/useUserLabels';
import { useGlobalState } from '@/context/GlobalStateContext';
import SpotCard from '@/components/spots/SpotCard';
import SpotsMapView from '@/components/spots/SpotsMapView';
import SpotsFilterBar, { DEFAULT_SPOTS_FILTERS } from '@/components/spots/SpotsFilterBar';
import { Button } from '@/components/ui/button';
import { List, Map, Heart, ChevronLeft, Tag, Search, X } from 'lucide-react';
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
import { humanizeCategory } from '@/lib/filterOptions';
import { SLUG_TO_STATUS_LIST, LIST_MATCHER, EMPTY_STATES } from '@/lib/spotListConstants';

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

export default function SpotsList() {
  const { listSlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { spots, isLoading, removeSpot, moveToList, updateNote, isAuthenticated } = useSpots();
  const { getVenueLabels, userLabels } = useUserLabels();
  const { lists: customLists, isLoading: customListsLoading, removeVenue: removeFromCustomList, saveVenue: saveToCustomList } = useBroncoSpotLists();
  const { state } = useGlobalState();

  // Resolve the slug against status lists first, then custom lists by id.
  const activeList = SLUG_TO_STATUS_LIST[listSlug] ?? null;
  const activeCustomList = useMemo(
    () => (activeList ? null : customLists.find((l) => l.id === listSlug)),
    [activeList, customLists, listSlug]
  );
  const activeListLabel = activeCustomList?.name ?? activeList;
  const resolved = !!activeList || !!activeCustomList;

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');

  // ── Label filter ──
  const [activeLabelId, setActiveLabelId] = useState(null); // null = All

  // ── Filter bar ──
  const [filters, setFilters] = useState(DEFAULT_SPOTS_FILTERS);

  // ── View ──
  const [viewMode, setViewMode] = useState('list');

  // ── Edit mode ── (auto-enabled via ?edit=1, e.g. from the tile's Edit dialog)
  const [isEditMode, setIsEditMode] = useState(searchParams.get('edit') === '1');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [noteDialogSpot, setNoteDialogSpot] = useState(null);

  // All spots for the active list
  const listSpots = useMemo(() => {
    if (activeCustomList) {
      return activeCustomList.items
        .filter((item) => item.venue)
        .map((item) => ({
          ...item.venue,
          favoriteId: item.id,
          labels: [],
          interactionType: null,
          rating: null,
          notes: null,
        }));
    }
    const matcher = LIST_MATCHER[activeList];
    return matcher ? spots.filter(matcher) : [];
  }, [spots, activeList, activeCustomList]);

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

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) =>
        s.name?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q)
      );
    }

    if (activeLabelId) {
      const autoMatch = autoLabels.find((a) => a.key === activeLabelId);
      if (autoMatch) {
        result = result.filter((s) => s.category === activeLabelId);
      } else {
        result = result.filter((s) =>
          getVenueLabels(s.google_place_id).some((l) => l.id === activeLabelId)
        );
      }
    }

    if (filters.priceLevels.length > 0) {
      result = result.filter((s) => s.price_level != null && filters.priceLevels.includes(Number(s.price_level)));
    }

    if (filters.cuisines.length > 0) {
      result = result.filter((s) => filters.cuisines.includes(s.category));
    }

    if (filters.walkInOnly) {
      result = result.filter((s) => s.is_available === true);
    }

    const userLon = userLoc?.lon ?? userLoc?.lng;
    if (filters.radius !== null && userLoc?.lat && userLon) {
      result = result.filter((s) => {
        if (!s.lat || !s.lng) return true;
        const dist = haversineKm(userLoc.lat, userLon, s.lat, s.lng);
        return dist <= filters.radius;
      });
    }

    return result;
  }, [listSpots, searchQuery, activeLabelId, filters, autoLabels, getVenueLabels, state.userLocation]);

  // ── Handlers ──

  const handleRemove = async (placeId) => {
    if (activeCustomList) {
      const item = activeCustomList.items.find((i) => i.venue?.google_place_id === placeId);
      if (!item?.venue) return;
      try {
        await removeFromCustomList(item.venue, activeCustomList.id);
        toast.success('Removed from list');
      } catch {
        toast.error('Failed to remove');
      }
      return;
    }
    try {
      await removeSpot(placeId);
      toast.success('Removed from Spots');
    } catch {
      toast.error('Failed to remove');
    }
  };

  // Move targets always include every OTHER list — status and custom alike —
  // regardless of which kind of list is currently open. Custom lists are
  // independent of status and of each other, so a venue can end up in
  // multiple lists at once. Status lists used to be mutually exclusive (a
  // venue has exactly one rating), but 'Been To' is now a catch-all over any
  // rating, so a venue can match 'Been To' AND Favourites/Didn't Like It at
  // once — moveTargets is computed per spot (below) to avoid offering a
  // no-op "move to" for a list the spot already belongs to.
  const customMoveTargets = useMemo(
    () => customLists
      .filter((l) => l.id !== activeCustomList?.id)
      .map((l) => ({ kind: 'custom', value: l.id, label: l.name })),
    [activeCustomList, customLists]
  );

  const moveTargets = useMemo(() => {
    const statusTargets = ['Favourites', 'Interested', 'Been To', 'Not Interested', "Didn't Like It"]
      .filter((l) => l !== activeList)
      .map((l) => ({ kind: 'status', value: l, label: l }));
    return [...statusTargets, ...customMoveTargets];
  }, [activeList, customMoveTargets]);

  const getMoveTargetsFor = (spot) => {
    const alreadyIn = new Set(spot.labels?.length ? spot.labels : (activeList ? [activeList] : []));
    const statusTargets = ['Favourites', 'Interested', 'Been To', 'Not Interested', "Didn't Like It"]
      .filter((l) => !alreadyIn.has(l))
      .map((l) => ({ kind: 'status', value: l, label: l }));
    return [...statusTargets, ...customMoveTargets];
  };

  const moveVenueTo = async (placeId, target) => {
    if (target.kind === 'status') {
      await moveToList({ placeId, listName: target.value });
      return;
    }
    const targetList = customLists.find((l) => l.id === target.value);
    if (!targetList) throw new Error('Target list not found');
    if (activeCustomList) {
      // Moving between two custom lists is a real transfer of membership.
      const item = activeCustomList.items.find((i) => i.venue?.google_place_id === placeId);
      if (!item?.venue) return;
      await saveToCustomList(item.venue, targetList.id);
      await removeFromCustomList(item.venue, activeCustomList.id);
    } else {
      // Adding a status-list venue into a custom list is additive — it
      // doesn't remove the venue's status rating, since the two systems are
      // independent (a venue can be in Favourites AND a custom list).
      const venue = listSpots.find((s) => s.google_place_id === placeId);
      if (venue) await saveToCustomList(venue, targetList.id);
    }
  };

  const handleMoveSingle = async (placeId, target) => {
    try {
      await moveVenueTo(placeId, target);
      toast.success(`Moved to ${target.label}`);
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

  const handleBulkMove = async (encodedTarget) => {
    const target = moveTargets.find((t) => `${t.kind}:${t.value}` === encodedTarget);
    if (!target) return;
    try {
      await Promise.all([...selectedIds].map((placeId) => moveVenueTo(placeId, target)));
      toast.success(`Moved ${selectedIds.size} venue${selectedIds.size > 1 ? 's' : ''} to ${target.label}`);
    } catch {
      toast.error('Failed to move some venues');
    }
    setSelectedIds(new Set());
    setIsEditMode(false);
  };

  const handleBulkDelete = async () => {
    try {
      if (activeCustomList) {
        await Promise.all(
          [...selectedIds].map(async (placeId) => {
            const item = activeCustomList.items.find((i) => i.venue?.google_place_id === placeId);
            if (item?.venue) await removeFromCustomList(item.venue, activeCustomList.id);
          })
        );
      } else {
        await Promise.all([...selectedIds].map((placeId) => removeSpot(placeId)));
      }
      toast.success(`Deleted ${selectedIds.size} venue${selectedIds.size > 1 ? 's' : ''}`);
    } catch {
      toast.error('Failed to delete some venues');
    }
    setSelectedIds(new Set());
    setIsEditMode(false);
  };

  const hasActiveFilters = filters.walkInOnly || filters.priceLevels.length > 0 || filters.cuisines.length > 0 || filters.radius !== null;

  // Wait for lists to load before deciding a slug is unresolvable.
  if (!isLoading && !customListsLoading && !resolved) {
    return <Navigate to="/Spots" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/Spots" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 md:px-8 lg:px-12 py-6 max-w-4xl mx-auto space-y-4">

        {/* ── Back + list name ── */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/Spots')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to lists"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="text-2xl font-bold text-foreground truncate">{activeListLabel}</h1>
        </div>

        {/* ── Search bar ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search within ${activeListLabel}...`}
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

        {/* ── Label filter row ── */}
        {(autoLabels.length > 0 || listUserLabels.length > 0) && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
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

            {autoLabels.length > 0 && listUserLabels.length > 0 && (
              <div className="h-5 w-px bg-border shrink-0 self-center mx-0.5" />
            )}

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

        {/* ── Toolbar: Map/List toggle + Edit ── */}
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
          {listSpots.length > 0 && (
            <Button
              variant={isEditMode ? 'default' : 'outline'}
              size="sm"
              className="ml-auto"
              onClick={() => {
                setIsEditMode((v) => !v);
                setSelectedIds(new Set());
              }}
            >
              {isEditMode ? 'Done' : 'Edit'}
            </Button>
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
                : (EMPTY_STATES[activeList] ?? 'No venues in this list yet.')}
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
                moveTargets={getMoveTargetsFor(spot)}
                onMove={handleMoveSingle}
                showNotes={!activeCustomList}
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
            <div className="relative">
              <select
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background"
                defaultValue=""
                onChange={(e) => { if (e.target.value) handleBulkMove(e.target.value); }}
              >
                <option value="" disabled>Move to...</option>
                {moveTargets.map((t) => (
                  <option key={`${t.kind}:${t.value}`} value={`${t.kind}:${t.value}`}>{t.label}</option>
                ))}
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
      </div>

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
