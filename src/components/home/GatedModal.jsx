import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AuthModal from '@/components/auth/AuthModal';

export default function GatedModal({ isOpen, onClose }) {
  const [showAuth, setShowAuth] = useState(false);

  const handleLogin = () => {
    onClose();
    setShowAuth(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="text-xl">Unlimited discovery when you login</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              You've used your free previews. Sign in for unlimited swipes and searches.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleLogin} className="w-full">Sign In</Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
              Maybe later
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AuthModal open={showAuth} onOpenChange={setShowAuth} />
    </>
  );
}
