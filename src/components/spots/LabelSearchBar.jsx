import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function LabelSearchBar({ allLabels, spots, onResults, onClose }) {
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Filter dropdown suggestions
  const suggestions = useMemo(() => {
    const lower = inputValue.toLowerCase();
    return allLabels.filter(
      (l) => !selectedLabels.includes(l) && l.toLowerCase().includes(lower)
    );
  }, [allLabels, selectedLabels, inputValue]);

  // Compute AND-filtered results whenever selectedLabels changes
  useEffect(() => {
    if (selectedLabels.length === 0) {
      onResults(null); // null means no search active
      return;
    }
    const filtered = spots.filter((spot) =>
      selectedLabels.every((label) => spot.labels?.includes(label))
    );
    onResults(filtered);
  }, [selectedLabels, spots, onResults]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addLabel = (label) => {
    setSelectedLabels((prev) => [...prev, label]);
    setInputValue('');
    inputRef.current?.focus();
  };

  const removeLabel = (label) => {
    setSelectedLabels((prev) => prev.filter((l) => l !== label));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      addLabel(suggestions[0]);
    }
    if (e.key === 'Backspace' && !inputValue && selectedLabels.length > 0) {
      removeLabel(selectedLabels[selectedLabels.length - 1]);
    }
  };

  const clearAll = () => {
    setSelectedLabels([]);
    setInputValue('');
    onClose();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search bar with chips */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 min-h-[40px]">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {selectedLabels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-0.5 text-xs font-medium"
            >
              {label}
              <button
                onClick={() => removeLabel(label)}
                className="hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            placeholder={selectedLabels.length === 0 ? 'Search by label...' : 'Add another label...'}
            className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={clearAll}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
          {suggestions.map((label) => (
            <button
              key={label}
              onClick={() => {
                addLabel(label);
                setShowDropdown(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors text-popover-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Results summary */}
      {selectedLabels.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          Showing venues matching <span className="font-medium">all {selectedLabels.length}</span> selected labels
        </p>
      )}
    </div>
  );
}
