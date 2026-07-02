import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Plus, X } from 'lucide-react';
import { useBroncoSpotLists } from '@/hooks/useBroncoSpotLists';
import { useBronco } from '@/context/BroncoContext';
import { useAuth } from '@/lib/AuthContext';

// ── Individual saved-venue row ──────────────────────────────────────────────

function SpotRow({ item, listId, onRemove }) {
  const navigate = useNavigate();
  const { openRequestModal } = useBronco();
  const venue = item.venue;
  const [imgReady, setImgReady] = useState(false);

  if (!venue) return null;

  const placeId = (venue.google_place_id || '').replace(/^places\//, '');
  const avgResponseMin = venue.avg_response_sec != null
    ? Math.max(1, Math.round(venue.avg_response_sec / 60))
    : null;
  const photoUrl = venue.photo_urls?.[0];

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
      <div
        className="relative shrink-0 cursor-pointer"
        onClick={() => placeId && navigate(`/venue/${placeId}`, { state: { venue } })}
      >
        {photoUrl ? (
          <>
            <img
              src={photoUrl}
              alt={venue.name}
              className="h-14 w-14 rounded-lg object-cover"
              onLoad={() => setImgReady(true)}
              onError={() => setImgReady(true)}
            />
            {!imgReady && (
              <>
                <div className="absolute inset-0 rounded-lg animate-pulse bg-muted-foreground/25" />
                <div className="absolute inset-0 rounded-lg shimmer-sweep" />
              </>
            )}
          </>
        ) : (
          <div className="h-14 w-14 rounded-lg bg-muted" />
        )}
        {venue.is_available && (
          <span className="absolute top-1 left-1 h-2.5 w-2.5 rounded-full bg-[#22c55e] ring-2 ring-white" />
        )}
      </div>

      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <p
          className="text-sm font-semibold leading-tight truncate cursor-pointer"
          onClick={() => placeId && navigate(`/venue/${placeId}`, { state: { venue } })}
        >
          {(venue.name || '').split('|')[0].trim()}
        </p>
        {venue.is_available ? (
          <p className="text-xs text-[#16a34a] font-medium">Accepting walk-ins now</p>
        ) : (
          <p className="text-xs text-muted-foreground">Not currently available</p>
        )}
        {avgResponseMin !== null && (
          <p className="text-[10px] text-muted-foreground">~{avgResponseMin} min response</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {venue.is_available && (
          <button
            onClick={() => openRequestModal(venue)}
            className="rounded-full bg-[#22c55e] px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-[#16a34a] transition-colors"
          >
            Request
          </button>
        )}
        <button
          onClick={() => onRemove(item, listId)}
          className="rounded-full p-1 text-muted-foreground hover:text-destructive"
          aria-label="Remove from list"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Single named list ───────────────────────────────────────────────────────

function SpotList({ list, onRemove }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-5">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 mb-2 w-full text-left"
      >
        <Bookmark className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{list.name}</span>
        <span className="text-xs text-muted-foreground">({list.items.length})</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-2">
          {list.items.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">No venues in this list yet.</p>
          )}
          {list.items.map((item) => (
            <SpotRow key={item.id} item={item} listId={list.id} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section entry point ─────────────────────────────────────────────────────

export default function SpotListsSection() {
  const { user } = useAuth();
  const { lists, isLoading, createList, removeVenue } = useBroncoSpotLists();
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showInput, setShowInput] = useState(false);

  if (!user) return null;

  const handleCreate = async () => {
    if (!newListName.trim()) return;
    setCreating(true);
    await createList(newListName.trim());
    setNewListName('');
    setShowInput(false);
    setCreating(false);
  };

  return (
    <div className="mt-2 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-foreground">My Spot Lists</h2>
        <button
          onClick={() => setShowInput((v) => !v)}
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New List
        </button>
      </div>

      {showInput && (
        <div className="flex gap-2 mb-4">
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="List name"
            autoFocus
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newListName.trim()}
            className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50"
          >
            {creating ? '…' : 'Add'}
          </button>
        </div>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading lists…</p>
      )}

      {!isLoading && lists.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Create a list to save venues you want to visit — see their availability at a glance.
        </p>
      )}

      {lists.map((list) => (
        <SpotList key={list.id} list={list} onRemove={removeVenue} />
      ))}
    </div>
  );
}
