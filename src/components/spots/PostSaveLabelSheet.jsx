import React, { useState, useEffect, useRef } from 'react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserLabels } from '@/hooks/useUserLabels';

const MAX_LABEL_LENGTH = 30;
const AUTO_DISMISS_MS = 2000;

export default function PostSaveLabelSheet({ venue, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const [newLabelMode, setNewLabelMode] = useState(false);
  const [newLabelText, setNewLabelText] = useState('');
  const [applying, setApplying] = useState(false);
  const timerRef = useRef(null);
  const { recentLabels, applyLabel, createAndApplyLabel } = useUserLabels();

  const venueId = (venue?.google_place_id || venue?.place_id || '').replace(/^places\//, '');

  // Start auto-dismiss timer when not yet expanded
  useEffect(() => {
    if (!expanded) {
      timerRef.current = setTimeout(onClose, AUTO_DISMISS_MS);
    }
    return () => clearTimeout(timerRef.current);
  }, [expanded, onClose]);

  const handleExpand = () => {
    clearTimeout(timerRef.current);
    setExpanded(true);
  };

  const handleLabelTap = async (label) => {
    if (applying) return;
    setApplying(true);
    try {
      await applyLabel({ venueId, labelId: label.id });
    } catch {}
    onClose();
  };

  const handleNewLabelConfirm = async () => {
    const trimmed = newLabelText.trim();
    if (!trimmed || applying) return;
    setApplying(true);
    try {
      await createAndApplyLabel({ venueId, labelName: trimmed });
    } catch {}
    onClose();
  };

  return (
    <Drawer open onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DrawerContent>
        {!expanded ? (
          /* Collapsed: heading + skip, tap anywhere to expand */
          <div
            onClick={handleExpand}
            className="flex items-center justify-between px-5 py-4 cursor-pointer select-none"
          >
            <span className="text-sm font-medium text-foreground">Add a label?</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
          </div>
        ) : (
          /* Expanded: label chips + new label input */
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Add a label?</span>
              <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
                Skip
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {recentLabels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => handleLabelTap(label)}
                  disabled={applying}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                >
                  <Tag className="h-3 w-3 text-muted-foreground" />
                  {label.label_name}
                </button>
              ))}

              {recentLabels.length === 0 && !newLabelMode && (
                <p className="text-xs text-muted-foreground">No labels yet — create your first one.</p>
              )}

              {!newLabelMode ? (
                <button
                  onClick={() => setNewLabelMode(true)}
                  className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                >
                  + New label
                </button>
              ) : (
                <div className="flex items-center gap-2 w-full pt-1">
                  <input
                    autoFocus
                    value={newLabelText}
                    onChange={(e) => setNewLabelText(e.target.value.slice(0, MAX_LABEL_LENGTH))}
                    placeholder="Label name..."
                    className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    onKeyDown={(e) => e.key === 'Enter' && handleNewLabelConfirm()}
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {newLabelText.length}/{MAX_LABEL_LENGTH}
                  </span>
                  <button
                    onClick={handleNewLabelConfirm}
                    disabled={!newLabelText.trim() || applying}
                    className={cn(
                      'shrink-0 text-xs font-medium transition-colors',
                      newLabelText.trim() ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
