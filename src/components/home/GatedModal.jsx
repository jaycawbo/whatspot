import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

export default function GatedModal({ isOpen, onClose }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-5 w-5 text-foreground" />
          </div>
          <DialogTitle>Sign in to continue</DialogTitle>
          <DialogDescription>
            You've reached the limit for anonymous searches. Create a free account to keep discovering venues.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={() => { /* TODO: navigate to sign in */ }}>Sign In</Button>
          <Button variant="outline" onClick={() => { /* TODO: navigate to sign up */ }}>Create Account</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
