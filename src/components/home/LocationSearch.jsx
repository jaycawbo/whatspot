import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Loader2, X, Navigation, Map } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import LocationMapPicker from '@/components/home/LocationMapPicker';

export default function LocationSearch({ currentName, onLocationSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [didYouMean, setDidYouMean] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const fetchSuggestions = useCallback(async (text) => {
    if (text.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-location', {
        body: { query: text },
      });
      if (!error && data?.suggestions) {
        setSuggestions(data.suggestions);
        setSelectedIndex(-1);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setDidYouMean(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250);
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
            const data = await res.json();
            const name = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb || "Current Location";
            onLocationSelect({
              name,
              coords: { lat: latitude, lon: longitude, isGPS: true, isPinDrop: false, locationType: null },
            });
          } catch {
            onLocationSelect({
              name: "Current Location",
              coords: { lat: latitude, lon: longitude, isGPS: true, isPinDrop: false, locationType: null },
            });
          }
        },
        (err) => {
          console.error(err);
          setLoading(false);
        }
      );
    }
  };

  const selectSuggestion = async (suggestion) => {
    setLoading(true);
    try {
      // Geocode the selected place to get coordinates
      const { data, error } = await supabase.functions.invoke('geocode-address', {
        body: { address: suggestion.display_name },
      });
      if (!error && data?.success) {
        onLocationSelect({
          name: suggestion.full_name || suggestion.display_name,
          coords: { lat: data.lat, lon: data.lon, isGPS: false, isPinDrop: false, locationType: data.locationType || null },
        });
      } else {
        onLocationSelect({
          name: suggestion.full_name || suggestion.display_name,
          coords: null,
        });
      }
    } catch {
      onLocationSelect({
        name: suggestion.full_name || suggestion.display_name,
        coords: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    // If user has a highlighted suggestion, select it
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      selectSuggestion(suggestions[selectedIndex]);
      return;
    }

    // If there are suggestions but user pressed Enter without selecting, show "Did you mean?"
    if (suggestions.length > 0) {
      setDidYouMean(suggestions.slice(0, 3));
      return;
    }

    // No suggestions at all — fetch one last time then show "Did you mean?"
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('search-location', {
        body: { query: trimmed },
      });
      if (data?.suggestions?.length > 0) {
        setDidYouMean(data.suggestions.slice(0, 3));
      } else {
        // Nothing found, just close
        onClose();
      }
    } catch {
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    const list = didYouMean || suggestions;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && list[selectedIndex]) {
      e.preventDefault();
      selectSuggestion(list[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const displayList = didYouMean || (query.length >= 2 ? suggestions : []);

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit} className="flex items-center gap-1">
        <div className="relative">
          <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={currentName || 'Search location...'}
            className="h-8 w-48 md:w-64 pl-7 pr-8 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ring-offset-background"
          />
          {loading ? (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); setSuggestions([]); setDidYouMean(null); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </form>

      {displayList.length > 0 ? (
        <div className="absolute top-full left-0 mt-1 w-72 md:w-80 bg-popover border border-border rounded-lg shadow-lg z-[60] overflow-hidden">
          {didYouMean && (
            <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border bg-muted/50">
              Did you mean?
            </div>
          )}
          {displayList.map((s, i) => (
            <button
              key={s.place_id || i}
              onClick={() => selectSuggestion(s)}
              className={cn(
                'w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-accent/50 transition-colors',
                i === selectedIndex && 'bg-accent/50'
              )}
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-xs text-foreground leading-snug">{s.display_name}</span>
            </button>
          ))}
        </div>
      ) : !query && (
        <div className="absolute top-full left-0 mt-1 w-72 md:w-80 bg-popover border border-border rounded-lg shadow-lg z-[60] overflow-hidden py-1">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-accent/50 transition-colors text-primary"
          >
            <Navigation className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Use current location</span>
          </button>
          <button
            type="button"
            onClick={() => setMapPickerOpen(true)}
            className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-accent/50 transition-colors text-foreground"
          >
            <Map className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Pin a location on map</span>
          </button>
        </div>
      )}

      {mapPickerOpen && (
        <LocationMapPicker 
          isOpen={mapPickerOpen} 
          onClose={() => setMapPickerOpen(false)} 
          onLocationSelect={onLocationSelect} 
        />
      )}
    </div>
  );
}
