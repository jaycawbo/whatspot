import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Share2, Pencil, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { logEvent } from '@/lib/logEvent';

export default function ListEditDialog({ tile, onOpenChange, ensureShareLink, toggleStatusVisibility, toggleListVisibility }) {
  const navigate = useNavigate();
  const [isPublic, setIsPublic] = useState(tile?.isPublic ?? true);
  const [busy, setBusy] = useState(false);

  if (!tile) return null;

  const handleShare = async () => {
    setBusy(true);
    try {
      // Custom lists always have a share_token (DB default on the row).
      // Status lists have no row until the first share/visibility action,
      // so materialize one now if needed.
      let shareToken = tile.shareToken;
      if (!shareToken && tile.kind === 'status') {
        const settings = await ensureShareLink(tile.id);
        shareToken = settings?.share_token;
      }
      if (!shareToken) throw new Error('No share link available');
      const url = `${window.location.origin}/lists/${shareToken}`;
      await navigator.clipboard.writeText(url);
      toast.success('Link copied!');
      logEvent('list_shared', { metadata: { list_kind: tile.kind, list_id: tile.id } });
    } catch (err) {
      toast.error('Failed to create share link');
    }
    setBusy(false);
  };

  const handleEditList = () => {
    onOpenChange(false);
    navigate(`/Spots/${tile.slug}?edit=1`);
  };

  const handleToggleVisibility = async (checked) => {
    setIsPublic(checked);
    setBusy(true);
    try {
      if (tile.kind === 'status') {
        await toggleStatusVisibility({ listKey: tile.id, isPublic: checked });
      } else {
        await toggleListVisibility(tile.id, checked);
      }
      logEvent('list_visibility_toggled', { metadata: { list_kind: tile.kind, list_id: tile.id, is_public: checked } });
    } catch {
      setIsPublic(!checked);
      toast.error('Failed to update visibility');
    }
    setBusy(false);
  };

  return (
    <Dialog open={!!tile} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">{tile.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <button
            onClick={handleShare}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
          >
            <Share2 className="h-4 w-4 text-muted-foreground" />
            Share list
          </button>

          <button
            onClick={handleEditList}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
            Edit list
          </button>

          <div className="flex items-center justify-between rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-3 text-sm">
              {isPublic ? (
                <Unlock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
              {isPublic ? 'Public' : 'Private'}
            </div>
            <Switch checked={isPublic} onCheckedChange={handleToggleVisibility} disabled={busy} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
