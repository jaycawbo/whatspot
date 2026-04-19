import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Navigation, Loader2, X, MapPin } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLocation } from '@/hooks/useLocation';

const PHOTON_URL = 'https://photon.komoot.io/api/';
const USER_AGENT = 'WhatSpot/1.0';
const MIN_QUERY_LEN = 3;
const DEBOUNCE_MS = 600;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

function buildSuggestionLabel(properties) {
  const { housenumber, street, name, city, state, country } = properties;
  if (housenumber && street) {
    return [`${housenumber} ${street}`, city, state, country].filter(Boolean).join(', ');
  }
  if (street) {
    return [street, city, state, country].filter(Boolean).join(', ');
  }
  return [name, city, country].filter(Boolean).join(', ') || 'Unknown location';
}

export default function LocationPickerSheet({ open, onClose }) {
  const { currentLocation, detectCurrentLocation, setManualLocation, isDetecting, locationError } = useLocation();
  const isMobile = useIsMobile();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const wasDetectingRef = useRef(false);
  const dropdownRef = useRef(null);
  const coordsRef = useRef({ lat: currentLocation.lat, lon: currentLocation.lon });

  // Keep coordsRef current so fetchSuggestions always has fresh coordinates
  // without needing to be recreated on every location change
  useEffect(() => {
    coordsRef.current = { lat: currentLocation.lat, lon: currentLocation.lon };
  }, [currentLocation.lat, currentLocation.lon]);

  // Auto-close after successful GPS detection
  useEffect(() => {
    if (isDetecting) {
      wasDetectingRef.current = true;
    }
    if (wasDetectingRef.current && !isDetecting && !locationError) {
      wasDetectingRef.current = false;
      onClose();
    }
  }, [isDetecting, locationError, onClose]);

  // Reset state when sheet opens; abort fetch when it closes
  useEffect(() => {
    if (open) {
      setQuery('');
      setSuggestions([]);
      wasDetectingRef.current = false;
    } else {
      if (abortRef.current) abortRef.current.abort();
    }
  }, [open]);

  // Click-outside to close on desktop.
  // Deferred via rAF to avoid catching the synthetic mousedown that mobile
  // browsers fire after touchend — which would close the dropdown immediately.
  useEffect(() => {
    if (!open || isMobile) return;
    let rafId;
    let handler;
    rafId = requestAnimationFrame(() => {
      handler = (e) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handler);
    });
    return () => {
      cancelAnimationFrame(rafId);
      if (handler) document.removeEventListener('mousedown', handler);
    };
  }, [open, isMobile, onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const fetchSuggestions = useCallback(async (text) => {
    if (text.length < MIN_QUERY_LEN) {
      setSuggestions([]);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setIsSearching(true);
    try {
      const { lat, lon } = coordsRef.current;
      let url = `${PHOTON_URL}?q=${encodeURIComponent(text)}&limit=5&lang=en`;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        url += `&lat=${lat}&lon=${lon}`;
      }
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`Photon ${res.status}`);
      const data = await res.json();
      setSuggestions(data.features || []);
    } catch (err) {
      if (err.name !== 'AbortError') setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < MIN_QUERY_LEN) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(val), DEBOUNCE_MS);
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
  };

  const handleSuggestionSelect = (feature) => {
    const [lon, lat] = feature.geometry.coordinates; // GeoJSON: [lon, lat]
    const label = buildSuggestionLabel(feature.properties);
    setManualLocation({ label, lat, lon });
    onClose();
  };

  const pickerContent = (
    <div className="space-y-3">
      {/* Search input — first */}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInputChange}
          placeholder="Search for a city or address"
          className="pl-9 pr-9"
          autoFocus={!isMobile}
        />
        {isSearching ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : query ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          {suggestions.map((feature, i) => (
            <button
              key={i}
              onClick={() => handleSuggestionSelect(feature)}
              className={cn(
                'w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-accent/50 transition-colors text-sm',
                i > 0 && 'border-t border-border'
              )}
            >
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="leading-snug text-foreground">
                {buildSuggestionLabel(feature.properties)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* GPS button — second */}
      <Button
        variant="outline"
        className="w-full justify-start gap-2 text-primary border-primary/30"
        onClick={detectCurrentLocation}
        disabled={isDetecting}
      >
        {isDetecting ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        ) : (
          <Navigation className="h-4 w-4 shrink-0" />
        )}
        {isDetecting ? 'Detecting location...' : 'Use current location'}
      </Button>

      {locationError && (
        <p className="text-sm text-destructive px-1">{locationError}</p>
      )}
    </div>
  );

  // Mobile: bottom sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto pb-8 px-0">
          <SheetHeader className="px-6 mb-4">
            <SheetTitle>Change Location</SheetTitle>
          </SheetHeader>
          <div className="px-6">{pickerContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: dropdown anchored below the header location button
  if (!open) return null;

  return (
    <div
      ref={dropdownRef}
      className="fixed top-14 left-8 w-80 bg-popover border border-border rounded-lg shadow-lg z-[60] p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">Change Location</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {pickerContent}
    </div>
  );
}
