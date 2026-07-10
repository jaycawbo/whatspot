import { useEffect, useRef, useState } from 'react';
import { Bookmark } from 'lucide-react';
import StampBounce from '../StampBounce';
import { cn } from '@/lib/utils';

const CHIP_GRADIENTS = [
  'from-amber-200 to-amber-500',
  'from-emerald-200 to-green-600',
  'from-indigo-200 to-indigo-500',
  'from-rose-200 to-rose-500',
  'from-sky-200 to-sky-500',
  'from-yellow-200 to-yellow-600',
];
const FOLDERS = ['Date Night', 'Weekend Brunch', 'Coffee Runs'];
const SAVE_STAGGER_MS = 380;
const FOLDER_STAGGER_MS = 180;
const HOLD_MS = 1800;

export default function SpotsDemo({ active, reducedMotion }) {
  const [savedCount, setSavedCount] = useState(0);
  const [foldersShown, setFoldersShown] = useState(0);
  const [cycle, setCycle] = useState(0);
  const timersRef = useRef([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    if (!active) {
      setSavedCount(0);
      setFoldersShown(0);
      return;
    }

    if (reducedMotion) {
      setSavedCount(CHIP_GRADIENTS.length);
      setFoldersShown(FOLDERS.length);
      return;
    }

    const timers = timersRef.current;
    const schedule = (fn, delay) => {
      timers.push(setTimeout(fn, delay));
    };

    setSavedCount(0);
    setFoldersShown(0);

    let t = 0;
    for (let i = 1; i <= CHIP_GRADIENTS.length; i++) {
      t += SAVE_STAGGER_MS;
      schedule(() => setSavedCount(i), t);
    }
    t += 300;
    for (let i = 1; i <= FOLDERS.length; i++) {
      schedule(() => setFoldersShown(i), t + (i - 1) * FOLDER_STAGGER_MS);
    }
    t += (FOLDERS.length - 1) * FOLDER_STAGGER_MS + HOLD_MS;
    schedule(() => setCycle((c) => c + 1), t);

    return () => {
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion, cycle]);

  return (
    <div className="flex w-full flex-col items-center">
      <div className="grid grid-cols-3 gap-3">
        {CHIP_GRADIENTS.map((gradient, i) => {
          const saved = i < savedCount;
          return (
            <div key={i} className={cn('relative h-16 w-16 rounded-2xl bg-gradient-to-br', gradient)}>
              {saved && (
                <StampBounce
                  key={`${cycle}-${i}`}
                  reducedMotion={reducedMotion}
                  className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-green-600 bg-green-600 text-white shadow"
                >
                  <Bookmark className="h-3.5 w-3.5 fill-white" />
                </StampBounce>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-bold shadow-md">
        <span>📌 Spots saved ·</span>
        <span className="text-green-700">{savedCount}</span>
      </div>

      <div className="mt-3 flex min-h-[28px] flex-wrap justify-center gap-1.5">
        {FOLDERS.slice(0, foldersShown).map((folder, i) => (
          <StampBounce
            key={`${cycle}-${i}`}
            reducedMotion={reducedMotion}
            className="rounded-full border border-border bg-muted px-3 py-1.5 text-[11px] font-bold text-foreground"
          >
            {folder}
          </StampBounce>
        ))}
      </div>
    </div>
  );
}
