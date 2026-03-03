import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';

export default function LocationConfirmModal({
  isOpen,
  onClose,
  detectedLocation,
  currentLocation,
  onUpdateLocation,
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Location detected in search</DialogTitle>
          <DialogDescription>
            Your search mentions a different location. Would you like to update?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 rounded-lg border border-border p-3">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Detected</p>
              <p className="text-sm font-medium text-foreground">{detectedLocation}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border p-3">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="text-sm font-medium text-foreground">{currentLocation}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => { onUpdateLocation(detectedLocation); onClose(); }}>
              Update location
            </Button>
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Keep current
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
