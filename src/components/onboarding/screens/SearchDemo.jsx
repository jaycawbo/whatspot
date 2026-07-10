import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import StampBounce from '../StampBounce';
import { cn } from '@/lib/utils';

const PHRASE = 'Iconic bar for a night cap.';
const CHAR_MS = 48;
const CHIPS = ['🍸 Cocktails', '🌙 Late night', '💎 Upscale'];
const RESULTS = [
  { name: 'Ruby Room', meta: '★ 4.8 · $$$ · Cocktail bar', gradient: 'from-emerald-300 to-green-600' },
  { name: 'The Tin Cup', meta: '★ 4.5 · $$ · Late night', gradient: 'from-indigo-300 to-indigo-500' },
  { name: 'Cafe Lumen', meta: '★ 4.6 · $$$ · Wine bar', gradient: 'from-rose-300 to-rose-500' },
];
const CHIP_STAGGER_MS = 180;
const RESULT_STAGGER_MS = 220;
const BEST_MATCH_DELAY_MS = 250;
const HOLD_MS = 1400;
const PEEK_MS = 650;

export default function SearchDemo({ active, reducedMotion }) {
  const [typedLength, setTypedLength] = useState(0);
  const [chipsShown, setChipsShown] = useState(0);
  const [resultsShown, setResultsShown] = useState(0);
  const [bestMatchShown, setBestMatchShown] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [cycle, setCycle] = useState(0);
  const timersRef = useRef([]);

  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    if (!active) {
      setTypedLength(0);
      setChipsShown(0);
      setResultsShown(0);
      setBestMatchShown(false);
      setPeeking(false);
      return;
    }

    if (reducedMotion) {
      setTypedLength(PHRASE.length);
      setChipsShown(CHIPS.length);
      setResultsShown(RESULTS.length);
      setBestMatchShown(true);
      setPeeking(false);
      return;
    }

    const timers = timersRef.current;
    const schedule = (fn, delay) => {
      timers.push(setTimeout(fn, delay));
    };

    setTypedLength(0);
    setChipsShown(0);
    setResultsShown(0);
    setBestMatchShown(false);
    setPeeking(false);

    let t = 0;
    for (let i = 1; i <= PHRASE.length; i++) {
      t += CHAR_MS;
      schedule(() => setTypedLength(i), t);
    }
    t += 350;
    for (let i = 1; i <= CHIPS.length; i++) {
      schedule(() => setChipsShown(i), t + (i - 1) * CHIP_STAGGER_MS);
    }
    t += (CHIPS.length - 1) * CHIP_STAGGER_MS + 300;
    for (let i = 1; i <= RESULTS.length; i++) {
      const delay = t + (i - 1) * RESULT_STAGGER_MS;
      schedule(() => setResultsShown(i), delay);
      if (i === 1) schedule(() => setBestMatchShown(true), delay + BEST_MATCH_DELAY_MS);
    }
    t += (RESULTS.length - 1) * RESULT_STAGGER_MS + HOLD_MS;
    schedule(() => setPeeking(true), t);
    t += PEEK_MS;
    schedule(() => setPeeking(false), t);
    t += 500;
    schedule(() => setCycle((c) => c + 1), t);

    return () => {
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reducedMotion, cycle]);

  return (
    <div className="flex w-full flex-col items-center pt-2">
      <div className="flex w-full max-w-[280px] items-center gap-2 rounded-full border border-border bg-card px-4 py-3 shadow-md">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-[13px] text-foreground">
          {PHRASE.slice(0, typedLength)}
          {!reducedMotion && (
            <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-green-600 align-middle" />
          )}
        </span>
      </div>

      <div className="mt-3 flex min-h-[26px] w-full max-w-[280px] flex-wrap justify-center gap-1.5">
        {CHIPS.slice(0, chipsShown).map((chip, i) => (
          <StampBounce
            key={`${cycle}-${i}`}
            reducedMotion={reducedMotion}
            className="rounded-full border border-green-500 bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700"
          >
            {chip}
          </StampBounce>
        ))}
      </div>

      <motion.div
        className="mt-2.5 w-full max-w-[280px]"
        animate={{ y: peeking ? -20 : 0 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      >
        {RESULTS.slice(0, resultsShown).map((result, i) => (
          <motion.div
            key={`${cycle}-${i}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="relative mb-2 flex items-center gap-2.5 rounded-xl border border-border bg-card p-2 text-left"
          >
            <div className={cn('h-11 w-11 shrink-0 rounded-lg bg-gradient-to-br', result.gradient)} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-foreground">{result.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{result.meta}</div>
            </div>
            {i === 0 && bestMatchShown && (
              <StampBounce
                reducedMotion={reducedMotion}
                className="absolute -top-2 right-2 rounded-full bg-green-600 px-2 py-0.5 text-[9px] font-extrabold text-white"
              >
                Best match
              </StampBounce>
            )}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
