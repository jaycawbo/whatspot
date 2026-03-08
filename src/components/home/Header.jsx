import React, { useState } from 'react';
import { MapPin, X, ChevronDown } from 'lucide-react';
import { useGlobalState } from '@/context/GlobalStateContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import whatspotLogo from '@/assets/whatspot_logo.svg';
import LocationSearch from '@/components/home/LocationSearch';

export default function Header() {
  const { state, dispatch } = useGlobalState();
  const [editingLocation, setEditingLocation] = useState(false);

  const handleLocationSelect = ({ name, coords }) => {
    dispatch({
      type: 'SET_LOCATION',
      payload: {
        coords: coords || state.userLocation,
        name,
      },
    });
    setEditingLocation(false);
  };

  const handleClearSearch = () => {
    dispatch({ type: 'CLEAR_SEARCH' });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-background border-b border-border flex items-center px-4 md:px-8">
      <div className="flex items-center gap-2 min-w-0">
        <Link to="/" className="flex items-center">
          <img src={whatspotLogo} alt="Whatspot" className="h-7" />
        </Link>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 min-w-0">
        {editingLocation ? (
          <LocationSearch
            currentName={state.locationName}
            onLocationSelect={handleLocationSelect}
            onClose={() => setEditingLocation(false)}
          />
        ) : (
          <button
            onClick={() => setEditingLocation(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors max-w-[200px] truncate"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{state.locationName}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>
        )}

        {state.mode === 'post-search' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleClearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </header>
  );
}
