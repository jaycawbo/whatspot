import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Check, MoreHorizontal, Trash2, ArrowRightLeft, Tag, FileText } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const ALL_LISTS = ['Favourites', 'Interested', 'Been To', 'Not Interested', "Didn't Like It"];

export default function SpotCard({
  spot,
  onRemove,
  onMoveToList,
  onEditNote,
  isEditMode = false,
  isSelected = false,
  onToggleSelect,
}) {
  const navigate = useNavigate();
  const placeId = spot.google_place_id || '';
  const currentList = spot.labels?.[0] || '';
  const [noteExpanded, setNoteExpanded] = useState(false);

  const handleClick = () => {
    if (isEditMode) {
      onToggleSelect?.(placeId);
      return;
    }
    if (!placeId) return;
    navigate(`/venue/${placeId}`, { state: { venue: spot } });
  };

  const imgUrl = spot.photo_url || '/placeholder.svg';

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow group cursor-pointer',
        isEditMode ? 'hover:bg-accent/50' : 'hover:shadow-md',
        isSelected && 'ring-2 ring-primary bg-accent/30'
      )}
    >
      {/* Edit mode checkbox */}
      {isEditMode && (
        <div className="flex items-center shrink-0 pr-1">
          <div className={cn(
            'h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors',
            isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'
          )}>
            {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
        </div>
      )}

      {/* Thumbnail */}
      <img
        src={imgUrl}
        alt={spot.name}
        className="h-20 w-20 rounded-lg object-cover shrink-0 bg-muted"
        loading="lazy"
      />

      {/* Content */}
      <div className="flex flex-col min-w-0 flex-1 justify-between py-0.5">
        <div>
          <h3 className="font-semibold text-sm text-foreground truncate">{spot.name}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            {spot.address}
          </p>
          {spot.notes && (
            <p
              onClick={(e) => { e.stopPropagation(); setNoteExpanded((v) => !v); }}
              className={cn(
                'text-xs text-muted-foreground italic mt-1 cursor-pointer',
                noteExpanded ? '' : 'truncate'
              )}
            >
              "{spot.notes}"
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          {spot.rating && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-foreground">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {spot.rating}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {!isEditMode && (
        <div className="flex items-start shrink-0" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* Move to list */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Move to list
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {ALL_LISTS.map((list) => (
                    <DropdownMenuItem
                      key={list}
                      onClick={() => onMoveToList?.(placeId, list)}
                      className={cn('gap-2', currentList === list && 'font-medium')}
                    >
                      {list}
                      {currentList === list && <Check className="h-3 w-3 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Add/edit note */}
              <DropdownMenuItem onClick={() => onEditNote?.(spot)} className="gap-2">
                <FileText className="h-3.5 w-3.5" />
                {spot.notes ? 'Edit note' : 'Add note'}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Delete */}
              <DropdownMenuItem
                onClick={() => onRemove?.(placeId)}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete from Spots
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
