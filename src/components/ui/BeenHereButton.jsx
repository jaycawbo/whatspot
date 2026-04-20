import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

function ThumbsDownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V2" />
      <path d="M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}

function ThumbsUpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10V22" />
      <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function TwoThumbsUpIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <g transform="scale(0.55) translate(0, 7)" opacity="0.45">
        <path d="M7 10V22" />
        <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
      <g transform="scale(0.55) translate(20, 0)">
        <path d="M7 10V22" />
        <path d="M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
      </g>
    </svg>
  );
}

const RATING_ICONS = {
  disliked: ThumbsDownIcon,
  liked: ThumbsUpIcon,
  loved: TwoThumbsUpIcon,
};

export default function BeenHereButton({ rating, onClick, className }) {
  const ActiveIcon = rating ? RATING_ICONS[rating] : null;

  if (ActiveIcon) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        className={cn(
          'h-7 w-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors',
          className
        )}
        aria-label="Been here"
      >
        <ActiveIcon className="h-4 w-4 text-white" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
        'group flex items-center gap-1 h-7 rounded-full border-2 border-white/60 bg-black/20 backdrop-blur-sm px-1.5 transition-all duration-200 hover:px-2.5 hover:bg-black/30 hover:border-white/80',
        className
      )}
      aria-label="Been here"
    >
      <Plus className="h-3.5 w-3.5 shrink-0 text-white" />
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium text-white transition-all duration-200 group-hover:max-w-[60px]">
        Been here
      </span>
    </button>
  );
}
