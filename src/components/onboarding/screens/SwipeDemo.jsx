import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Static compass layout: one venue card centered with a subtle idle bounce, arrows in all
// four directions carrying the swipe-meaning copy. Replaces the previous auto-cycling
// exit/stamp sequence — simpler visual, no state machine needed.
const CARD_WIDTH = 160;
const CARD_HEIGHT = 182;
const BOUNCE_TRANSITION = { duration: 2.4, repeat: Infinity, ease: 'easeInOut' };
const NUDGE_MS = 1300;

// Same fictional venue SearchDemo/SpotsDemo use (Bar Volta), so the demo reads as one
// consistent dataset across screens rather than a one-off placeholder.
const VENUE = { name: 'Bar Volta', gradient: 'from-amber-200 to-amber-500', rating: '4.7', price: '$$', distance: '0.4 km' };

// Colors mirror the real swipe-action colors in DiscoveryDeck.jsx: right/green (like),
// left/destructive-red (dislike), down/muted-grey (skip), up/blue (been-here overlay is
// hsla(210, 70%, 50%)). Each badge nudges a few px in its own direction on a loop — a quiet
// hint of the swipe gesture without re-introducing the old exit-animation complexity.
const DIRECTIONS = [
  { area: 'up', icon: ArrowUp, label: 'Been here', colorClass: 'text-blue-500', nudge: { y: -6 }, delay: 0 },
  { area: 'left', icon: ArrowLeft, label: 'Not interested', colorClass: 'text-destructive', nudge: { x: -6 }, delay: 0.15 },
  { area: 'right', icon: ArrowRight, label: 'Interested', colorClass: 'text-green-600', nudge: { x: 6 }, delay: 0.3 },
  { area: 'down', icon: ArrowDown, label: 'Skip for now', colorClass: 'text-muted-foreground', nudge: { y: 6 }, delay: 0.45 },
];

function DirectionArrow({ icon: Icon, label, area, colorClass, nudge, delay, animated }) {
  const axis = nudge.x !== undefined ? 'x' : 'y';
  const amount = nudge.x !== undefined ? nudge.x : nudge.y;

  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ gridArea: area }}>
      <motion.div
        className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card shadow-md"
        animate={animated ? { [axis]: [0, amount, 0] } : { [axis]: 0 }}
        transition={animated ? { duration: NUDGE_MS / 1000, repeat: Infinity, ease: 'easeInOut', delay } : { duration: 0 }}
      >
        <Icon className={cn('h-5 w-5', colorClass)} strokeWidth={2.5} />
      </motion.div>
      <span className="max-w-[100px] text-[17px] font-semibold leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

export default function SwipeDemo({ active, reducedMotion }) {
  const animated = active && !reducedMotion;

  return (
    <div
      className="relative grid w-full max-w-[360px] items-center justify-items-center"
      style={{
        gridTemplateAreas: '". up ." "left card right" ". down ."',
        gridTemplateColumns: 'minmax(70px,1fr) auto minmax(70px,1fr)',
        gridTemplateRows: 'auto auto auto',
        columnGap: 20,
        rowGap: 18,
      }}
    >
      {DIRECTIONS.map((d) => (
        <DirectionArrow key={d.area} {...d} animated={animated} />
      ))}

      <motion.div
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md"
        style={{ gridArea: 'card', width: CARD_WIDTH, height: CARD_HEIGHT }}
        animate={animated ? { y: [0, -8, 0] } : { y: 0 }}
        transition={animated ? BOUNCE_TRANSITION : { duration: 0 }}
      >
        <div className={cn('h-[62%] bg-gradient-to-br', VENUE.gradient)} />
        <div className="flex h-[38%] flex-col justify-center gap-1 px-3">
          <div className="text-sm font-extrabold text-foreground">{VENUE.name}</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="font-bold text-amber-700">★ {VENUE.rating}</span>
            <span>·</span>
            <span>{VENUE.price}</span>
            <span>·</span>
            <span>{VENUE.distance}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
