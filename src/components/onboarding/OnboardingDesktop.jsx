import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ONBOARDING_SCREENS } from './screens/onboardingContent';
import SwipeDemo from './screens/SwipeDemo';
import SearchDemo from './screens/SearchDemo';
import SpotsDemo from './screens/SpotsDemo';

const DEMOS = [SwipeDemo, SearchDemo, SpotsDemo];
const SCREEN_COUNT = ONBOARDING_SCREENS.length;
// 450ms, cubic-bezier(0.4, 0, 0.2, 1) for the horizontal screen slide.
const SLIDE_TRANSITION = { duration: 0.45, ease: [0.4, 0, 0.2, 1] };

export default function OnboardingDesktop({ screenIndex, onNext, onDotClick, onClose }) {
  const prefersReducedMotion = useReducedMotion();
  const [liveSwipeSubcopy, setLiveSwipeSubcopy] = useState(ONBOARDING_SCREENS[0].subcopy);
  const [liveSpotsSubcopy, setLiveSpotsSubcopy] = useState(ONBOARDING_SCREENS[2].subcopy);
  const isLast = screenIndex === SCREEN_COUNT - 1;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <motion.div
        className="relative flex h-[460px] max-h-[85vh] w-[720px] max-w-[92vw] overflow-hidden rounded-3xl bg-background shadow-2xl"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative flex-1 overflow-hidden">
          <motion.div
            className="flex h-full"
            style={{ width: `${SCREEN_COUNT * 100}%` }}
            animate={{ x: `-${screenIndex * (100 / SCREEN_COUNT)}%` }}
            transition={SLIDE_TRANSITION}
          >
            {ONBOARDING_SCREENS.map((s, i) => {
              const Demo = DEMOS[i];
              return (
                <section key={i} className="flex h-full" style={{ width: `${100 / SCREEN_COUNT}%` }}>
                  <div className="flex w-[52%] items-center justify-center overflow-hidden bg-muted">
                    <Demo
                      active={i === screenIndex}
                      reducedMotion={!!prefersReducedMotion}
                      {...(i === 0 ? { onSubcopyChange: setLiveSwipeSubcopy } : {})}
                      {...(i === 2
                        ? { onSubcopyChange: (text) => setLiveSpotsSubcopy(text ?? ONBOARDING_SCREENS[2].subcopy) }
                        : {})}
                    />
                  </div>
                  <div className="flex w-[48%] flex-col justify-center px-10 text-left">
                    <div className="mb-4 flex gap-1.5">
                      {ONBOARDING_SCREENS.map((_, dotIndex) => (
                        <button
                          key={dotIndex}
                          type="button"
                          onClick={() => onDotClick(dotIndex)}
                          aria-label={`Go to screen ${dotIndex + 1}`}
                          className="p-1.5"
                        >
                          <span
                            className={cn(
                              'block h-[7px] rounded-full transition-all duration-300',
                              dotIndex === screenIndex ? 'w-5 bg-green-600' : 'w-[7px] bg-border'
                            )}
                          />
                        </button>
                      ))}
                    </div>
                    <h2 className="text-2xl font-extrabold tracking-tight text-foreground">{s.headline}</h2>
                    <p className="mb-4 mt-2 min-h-[20px] text-sm text-muted-foreground">
                      {i === 0 ? liveSwipeSubcopy : i === 2 ? liveSpotsSubcopy : s.subcopy}
                    </p>
                    <button
                      type="button"
                      onClick={onNext}
                      className={cn(
                        'w-fit rounded-full px-7 py-3 text-[15px] font-bold text-white transition-colors',
                        isLast ? 'bg-green-600 hover:bg-green-700' : 'bg-foreground hover:bg-foreground/90'
                      )}
                    >
                      {isLast ? 'Get started' : 'Next'}
                    </button>
                  </div>
                </section>
              );
            })}
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
