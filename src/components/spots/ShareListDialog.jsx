import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Copy, Check, Share2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

export default function ShareListDialog({ open, onOpenChange }) {
  const { user } = useAuth();
  const [isPublic, setIsPublic] = useState(false);
  const [shareToken, setShareToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const togglePublic = async (checked) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ spots_is_public: checked })
        .eq('id', user.id)
        .select('spots_share_token')
        .single();
      if (error) throw error;
      setIsPublic(checked);
      setShareToken(data.spots_share_token);
    } catch (err) {
      toast.error('Failed to update sharing');
      console.error(err);
    }
    setLoading(false);
  };

  const shareUrl = shareToken
    ? `${window.location.origin}/Spots?share=${shareToken}`
    : null;

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-muted-foreground" />
            Share Your Spots
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Make Spots public</p>
              <p className="text-xs text-muted-foreground">Anyone with the link can view your saved spots</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={togglePublic} disabled={loading} />
          </div>

          {isPublic && shareUrl && (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground"
              />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
