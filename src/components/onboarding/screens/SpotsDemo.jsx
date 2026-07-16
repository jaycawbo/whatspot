import { useEffect, useRef, useState } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { Coffee, Heart, MapPin } from 'lucide-react';
import StampBounce from '../StampBounce';
import { cn } from '@/lib/utils';

// Pin color matches each spot's gradient swatch so the grid and map scenes read as the
// same spots, not two unrelated visuals.
const SPOTS = [
  { gradient: 'from-amber-200 to-amber-500', pin: 'text-amber-500' },
  { gradient: 'from-emerald-200 to-green-600', pin: 'text-green-600' },
  { gradient: 'from-indigo-200 to-indigo-500', pin: 'text-indigo-500' },
  { gradient: 'from-rose-200 to-rose-500', pin: 'text-rose-500' },
  { gradient: 'from-sky-200 to-sky-500', pin: 'text-sky-500' },
  { gradient: 'from-yellow-200 to-yellow-600', pin: 'text-yellow-600' },
];
// Which 3 spots "belong" to the Coffee Runs folder and survive the filter.
const SURVIVING = [0, 2, 4];
// Target positions (% of the mock map area) for the 3 surviving pins, in SURVIVING order.
const PIN_POSITIONS = [
  { top: '26%', left: '30%' },
  { top: '60%', left: '68%' },
  { top: '68%', left: '22%' },
];

const FOLDERS = ['Date Night', 'Weekend Brunch', 'Coffee Runs'];
const COFFEE_RUNS_INDEX = FOLDERS.length - 1;
const SAVE_STAGGER_MS = 380;
const FOLDER_STAGGER_MS = 180;
const PRE_SELECT_HOLD_MS = 700;
const SELECT_MS = 450;
const POST_FILTER_HOLD_MS = 700;
const MAP_HOLD_MS = 1800;
const MAP_SUBCOPY = 'See them all on the map';

export default function SpotsDemo({ active, reducedMotion, onSubcopyChange }) {
  const [savedCount, setSavedCount] = useState(0);
  const [foldersShown, setFoldersShown] = useState(0);
  const [coffeeSelected, setCoffeeSelected] = useState(false);
  const [phase, setPhase] = useState('grid');
  const [cycle, setCycle] = useState(0);
  const timersRef = useRef([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    if (!active) {
      setSavedCount(0);
      setFoldersShown(0);
      setCoffeeSelected(false);
      setPhase('grid');
      return;
    }

    if (reducedMotion) {
      setSavedCount(SPOTS.length);
      setFoldersShown(FOLDERS.length);
      setCoffeeSelected(true);
      setPhase('map');
      onSubcopyChange?.(MAP_SUBCOPY);
      return;
    }

    const timers = timersRef.current;
    const schedule = (fn, delay) => {
      timers.push(setTimeout(fn, delay));
    };

    setSavedCount(0);
    setFoldersShown(0);
    setCoffeeSelected(false);
    setPhase('grid');
    onSubcopyChange?.(undefined);

    let t = 0;
    for (let i = 1; i <= SPOTS.length; i++) {
      t += SAVE_STAGGER_MS;
      schedule(() => setSavedCount(i), t);
    }
    t += 300;
    for (let i = 1; i <= FOLDERS.length; i++) {
      schedule(() => setFoldersShown(i), t + (i - 1) * FOLDER_STAGGER_MS);
    }
    t += (FOLDERS.length - 1) * FOLDER_STAGGER_MS;

    t += PRE_SELECT_HOLD_MS;
    schedule(() => setCoffeeSelected(true), t);
    t += SELECT_MS;
    t += POST_FILTER_HOLD_MS;

    schedule(() => {
      setPhase('map');
      onSubcopyChange?.(MAP_SUBCOPY);
    }, t);
    t += MAP_HOLD_MS;

    schedule(() => {
      onSubcopyChange?.(undefined);
      setCycle((c) => c + 1);
    }, t);

    return () => {
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion, cycle]);

  return (
    <LayoutGroup id={`spots-${cycle}`}>
      <div className="relative flex w-full items-center justify-center" style={{ minHeight: 220 }}>
        {phase === 'grid' && (
          <div className="flex w-full flex-col items-center">
            <div className="grid grid-cols-3 gap-3">
              {SPOTS.map((spot, i) => {
                const saved = i < savedCount;
                const survives = SURVIVING.includes(i);
                const filteredOut = coffeeSelected && !survives;
                return (
                  // The heart badge is a sibling of the layoutId'd square, not a descendant of
                  // it: an element with an active layoutId continuously projects size/position
                  // correction onto its children, which fights with the heart's own independent
                  // scale/rotate keyframe animation and was the source of its glitchy entrance.
                  <div key={i} className="relative h-16 w-16">
                    <motion.div
                      layoutId={`spot-${i}`}
                      animate={{ opacity: filteredOut ? 0 : 1, scale: filteredOut ? 0.7 : 1 }}
                      transition={{ duration: SELECT_MS / 1000, ease: 'easeInOut' }}
                      className={cn('h-16 w-16 rounded-2xl bg-gradient-to-br', spot.gradient)}
                    />
                    {saved && (
                      <motion.div
                        className="absolute -right-1.5 -top-1.5"
                        animate={{ opacity: filteredOut ? 0 : 1, scale: filteredOut ? 0.7 : 1 }}
                        transition={{ duration: SELECT_MS / 1000, ease: 'easeInOut' }}
                      >
                        <StampBounce
                          key={`${cycle}-${i}`}
                          reducedMotion={reducedMotion}
                          variant="appear"
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-white shadow"
                        >
                          <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
                        </StampBounce>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-bold shadow-md">
              <span>Spots saved ·</span>
              <span className="text-green-700">{savedCount}</span>
            </div>

            <div className="mt-3 flex min-h-[28px] flex-wrap justify-center gap-1.5">
              {FOLDERS.slice(0, foldersShown).map((folder, i) => {
                const selected = i === COFFEE_RUNS_INDEX && coffeeSelected;
                return (
                  <StampBounce
                    key={`${cycle}-${i}`}
                    reducedMotion={reducedMotion}
                    variant="appear"
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[11px] font-bold text-foreground',
                      selected ? 'border-zinc-300 bg-white shadow-md' : 'border-border bg-muted'
                    )}
                  >
                    <motion.span
                      className="block"
                      animate={selected ? { scale: [1, 1.22, 1] } : { scale: 1 }}
                      transition={{ duration: SELECT_MS / 1000, ease: 'easeOut' }}
                    >
                      {folder}
                    </motion.span>
                  </StampBounce>
                );
              })}
            </div>
          </div>
        )}

        {phase === 'map' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="relative h-[190px] w-[220px] overflow-hidden rounded-2xl border border-border bg-sky-50"
          >
            {/* Stylized map texture: blocks, roads, a park patch — no real tiles/API calls. */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 220 190" preserveAspectRatio="none">
              <rect width="220" height="190" className="fill-sky-50" />
              <rect x="10" y="14" width="70" height="46" rx="6" className="fill-slate-200/70" />
              <rect x="120" y="10" width="90" height="58" rx="6" className="fill-slate-200/70" />
              <rect x="14" y="100" width="60" height="50" rx="6" className="fill-slate-200/70" />
              <rect x="140" y="110" width="66" height="60" rx="6" className="fill-slate-200/70" />
              <circle cx="188" cy="150" r="30" className="fill-green-200/70" />
              <path d="M0 70 H220" className="stroke-white" strokeWidth="10" />
              <path d="M0 96 H220" className="stroke-white" strokeWidth="6" />
              <path d="M90 0 V190" className="stroke-white" strokeWidth="10" />
              <path d="M188 0 V190" className="stroke-white" strokeWidth="6" />
            </svg>

            {SURVIVING.map((spotIndex, posIndex) => (
              <div
                key={spotIndex}
                className="absolute -translate-x-1/2 -translate-y-full"
                style={PIN_POSITIONS[posIndex]}
              >
                <motion.div layoutId={`spot-${spotIndex}`} transition={{ duration: 0.6, ease: 'easeInOut' }}>
                  <StampBounce reducedMotion={reducedMotion}>
                    <div className="relative">
                      <MapPin
                        className={cn('h-6 w-6 drop-shadow', SPOTS[spotIndex].pin)}
                        fill="currentColor"
                        fillOpacity={0.25}
                      />
                      <Coffee
                        className="absolute left-1/2 top-[6px] h-2.5 w-2.5 -translate-x-1/2 text-white"
                        strokeWidth={2.5}
                      />
                    </div>
                  </StampBounce>
                </motion.div>
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </LayoutGroup>
  );
}
