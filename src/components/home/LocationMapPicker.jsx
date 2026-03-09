import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useGlobalState } from '@/context/GlobalStateContext';
import { MapPin, Loader2 } from 'lucide-react';

function MapEvents({ onLocationSelected }) {
  useMapEvents({
    click(e) {
      onLocationSelected(e.latlng);
    },
  });
  return null;
}

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
          <MapContainer 
            center={[state.userLocation.lat, state.userLocation.lon]} 
            zoom={13} 
            className="w-full h-full"
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapEvents onLocationSelected={setSelectedPos} />
            {selectedPos && (
              <Marker position={selectedPos} />
            )}
          </MapContainer>
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