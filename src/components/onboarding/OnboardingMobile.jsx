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
// Fixed px thresholds, same convention as DiscoveryDeck's own swipe thresholds
// (src/components/discovery/DiscoveryDeck.jsx) rather than a %-of-viewport figure.
const PAGER_SWIPE_DISTANCE_PX = 60;
const PAGER_SWIPE_VELOCITY = 400;

export default function OnboardingMobile({ screenIndex, onNext, onDotClick, onClose }) {
  const prefersReducedMotion = useReducedMotion();
  const [liveSwipeSubcopy, setLiveSwipeSubcopy] = useState(ONBOARDING_SCREENS[0].subcopy);
  const [liveSpotsSubcopy, setLiveSpotsSubcopy] = useState(ONBOARDING_SCREENS[2].subcopy);
  const isLast = screenIndex === SCREEN_COUNT - 1;

  const handleDragEnd = (event, info) => {
    const { offset, velocity } = info;
    const swipedLeft = offset.x < -PAGER_SWIPE_DISTANCE_PX || velocity.x < -PAGER_SWIPE_VELOCITY;
    const swipedRight = offset.x > PAGER_SWIPE_DISTANCE_PX || velocity.x > PAGER_SWIPE_VELOCITY;
    if (swipedLeft && screenIndex < SCREEN_COUNT - 1) {
      onDotClick(screenIndex + 1);
    } else if (swipedRight && screenIndex > 0) {
      onDotClick(screenIndex - 1);
    }
    // Otherwise no screenIndex change — the track's own `animate` prop eases it
    // back to the current screen's position automatically.
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col bg-background"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex justify-center gap-1.5 pt-5">
        {ONBOARDING_SCREENS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onDotClick(i)}
            aria-label={`Go to screen ${i + 1}`}
            className="p-1.5"
          >
            <span
              className={cn(
                'block h-[7px] rounded-full transition-all duration-300',
                i === screenIndex ? 'w-5 bg-green-600' : 'w-[7px] bg-border'
              )}
            />
          </button>
        ))}
      </div>

      <div className="relative flex-1 overflow-hidden">
        <motion.div
          className="flex h-full"
          style={{ width: `${SCREEN_COUNT * 100}%` }}
          animate={{ x: `-${screenIndex * (100 / SCREEN_COUNT)}%` }}
          transition={SLIDE_TRANSITION}
          drag="x"
          dragMomentum={false}
          onDragEnd={handleDragEnd}
        >
          {ONBOARDING_SCREENS.map((s, i) => {
            const Demo = DEMOS[i];
            return (
              <section
                key={i}
                className="flex h-full flex-col items-center px-6 pt-2 text-center"
                style={{ width: `${100 / SCREEN_COUNT}%` }}
              >
                <div className="flex w-full flex-1 items-center justify-center" style={{ minHeight: 270 }}>
                  <Demo
                    active={i === screenIndex}
                    reducedMotion={!!prefersReducedMotion}
                    {...(i === 0 ? { onSubcopyChange: setLiveSwipeSubcopy } : {})}
                    {...(i === 2
                      ? { onSubcopyChange: (text) => setLiveSpotsSubcopy(text ?? ONBOARDING_SCREENS[2].subcopy) }
                      : {})}
                  />
                </div>
                <h2 className="mt-4 text-xl font-extrabold tracking-tight text-foreground">{s.headline}</h2>
                <p className="mb-1 mt-1.5 min-h-[20px] text-sm text-muted-foreground">
                  {i === 0 ? liveSwipeSubcopy : i === 2 ? liveSpotsSubcopy : s.subcopy}
                </p>
              </section>
            );
          })}
        </motion.div>
      </div>

      <div className="px-6 pb-7 pt-4">
        <button
          type="button"
          onClick={onNext}
          className={cn(
            'w-full rounded-full py-3.5 text-[15px] font-bold text-white transition-colors',
            isLast ? 'bg-green-600 hover:bg-green-700' : 'bg-foreground hover:bg-foreground/90'
          )}
        >
          {isLast ? 'Get started' : 'Next'}
        </button>
      </div>
    </motion.div>
  );
}
