import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useGlobalState } from '@/context/GlobalStateContext';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const LazyMap = lazy(() => import('./LocationMapContent'));



export default function LocationMapPicker({ isOpen, onClose, onLocationSelect }) {
  const { state } = useGlobalState();
  const [selectedPos, setSelectedPos] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPos({ lat: state.userLocation.lat, lng: state.userLocation.lon });
    }
  }, [isOpen, state.userLocation]);

  const handleConfirm = async () => {
    if (!selectedPos) return;
    setLoading(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${selectedPos.lat}&lon=${selectedPos.lng}&format=json`);
      const data = await res.json();
      const name = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb || "Map Location";
      
      onLocationSelect({
        name,
        coords: { lat: selectedPos.lat, lon: selectedPos.lng },
      });
    } catch {
      onLocationSelect({
        name: "Map Location",
        coords: { lat: selectedPos.lat, lon: selectedPos.lng },
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[90vw] h-[80vh] flex flex-col p-4">
        <DialogHeader className="mb-2 shrink-0">
          <DialogTitle>Pin a location</DialogTitle>
          <DialogDescription>
            Tap on the map to pin your desired location
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 min-h-0 rounded-md overflow-hidden relative border border-border">
          <ErrorBoundary fallback={
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Map failed to load. Please close and try again.
            </div>
          }>
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            }>
              <LazyMap
                center={[state.userLocation.lat, state.userLocation.lon]}
                selectedPos={selectedPos}
                onLocationSelected={setSelectedPos}
              />
            </Suspense>
          </ErrorBoundary>
        </div>

        <div className="mt-4 flex gap-2 shrink-0">
          <Button 
            className="flex-1" 
            onClick={handleConfirm} 
            disabled={!selectedPos || loading}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm Location
          </Button>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}