import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ListTile from '@/components/spots/ListTile';

export default function ListMosaic({ visibleTiles, hiddenTiles, onEdit }) {
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {visibleTiles.map((tile) => (
          <ListTile key={tile.id} tile={tile} onEdit={onEdit} />
        ))}
      </div>

      <button
        onClick={() => setHiddenExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        View all lists
        {hiddenExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {hiddenExpanded && (
        <div className="grid grid-cols-2 gap-3">
          {hiddenTiles.map((tile) => (
            <ListTile key={tile.id} tile={tile} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
