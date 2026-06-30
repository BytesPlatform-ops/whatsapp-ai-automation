'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Sparkles, Check } from 'lucide-react';
import {
  CATEGORY_THEME, PRIORITY_DOT, AGENT_META,
  type FeedCard as FeedCardType, type FeedCardAction,
} from '@/lib/pixie-lab/feed';

/**
 * PairedFeed — cards in rows of two. Hovering one card grows it (~60%) and
 * shrinks its partner (~40%); the row's overall size is fixed, so nothing
 * reflows (unlike a CSS-columns masonry). On mobile the pair stacks and every
 * card shows its full content (no hover). Prop-driven + reusable.
 */

function chunkPairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

type CardState = 'rest' | 'expanded' | 'shrunk';

function PairCard({
  card,
  state,
  onEnter,
  onLeave,
  onAction,
}: {
  card: FeedCardType;
  state: CardState;
  onEnter: () => void;
  onLeave: () => void;
  onAction?: (c: FeedCardType, a: FeedCardAction) => void;
}) {
  const theme = CATEGORY_THEME[card.category];
  const agent = AGENT_META[card.primary_agent];
  const expanded = state === 'expanded';
  const [done, setDone] = useState(false);

  function handle(a: FeedCardAction) {
    onAction?.(card, a);
    if (a.type === 'approve' || a.type === 'do_this') setDone(true);
  }

  // grow ratios → ~60/40 split on hover; equal at rest. flex-basis:0 so width is
  // driven purely by grow (and on mobile/column this collapses to full width).
  const grow = state === 'expanded' ? 1.62 : state === 'shrunk' ? 1 : 1;

  return (
    <motion.div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      animate={{ opacity: done ? 0 : 1, scale: done ? 0.97 : 1 }}
      transition={{ duration: 0.35 }}
      style={{ flexGrow: grow, flexBasis: 0, ['--accent' as string]: theme.accent }}
      className="group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] backdrop-blur-md transition-[flex-grow,border-color,background-color] duration-300 ease-out hover:border-white/20 hover:bg-white/[0.05]"
    >
      {/* accent rail */}
      <div className="absolute left-0 top-0 h-full w-1" style={{ background: theme.accent }} />
      {/* hover glow */}
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-25" style={{ background: theme.accent }} />

      <div className="flex h-full flex-col p-4 pl-5">
        {/* chips */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${theme.accent}1f`, color: theme.accent }}>
            {theme.label}
          </span>
          {card.primary_agent !== 'pixie' && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/55">{agent.label}</span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/35">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIORITY_DOT[card.priority] }} />
            {card.priority}
          </span>
        </div>

        <h3 className="mt-2.5 font-display text-[15px] font-bold leading-snug tracking-tight text-white">{card.heading}</h3>

        <p className={`mt-1.5 text-[12.5px] leading-relaxed text-white/60 ${expanded ? '' : 'line-clamp-2'} max-sm:line-clamp-none`}>
          {card.full_idea}
        </p>

        {/* reason + outcome — revealed when expanded (always on mobile) */}
        <div className={`mt-2 transition-opacity duration-300 ${expanded ? 'opacity-100' : 'opacity-0'} max-sm:opacity-100`}>
          <div className="flex items-start gap-1.5">
            <Sparkles size={12} className="mt-0.5 flex-none" style={{ color: theme.accent }} />
            <p className="text-[11.5px] leading-snug text-white/45 line-clamp-2">{card.reason}</p>
          </div>
          {card.outcome && <p className="mt-1.5 text-[12px] font-medium" style={{ color: theme.accent }}>→ {card.outcome}</p>}
        </div>

        {/* actions — pinned to bottom; visible when expanded (always on mobile) */}
        <div
          className={`mt-auto flex flex-wrap gap-2 pt-3 transition-opacity duration-200 ${expanded ? 'opacity-100' : 'pointer-events-none opacity-0'} max-sm:pointer-events-auto max-sm:opacity-100`}
          onClick={(e) => e.stopPropagation()}
        >
          {card.actions.map((a, i) => (
            <button
              key={a.id}
              onClick={() => handle(a)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold transition-transform active:scale-[0.97]"
              style={i === 0 ? { background: theme.accent, color: '#02070a' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {a.label}
              {i === 0 && <ChevronRight size={13} />}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center" style={{ background: `${theme.accent}14` }}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white">
              <Check size={15} style={{ color: theme.accent }} /> Done
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Row({ pair, onAction }: { pair: FeedCardType[]; onAction?: (c: FeedCardType, a: FeedCardAction) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-4 sm:h-[228px] sm:flex-row">
      {pair.map((card, i) => (
        <PairCard
          key={card.id}
          card={card}
          state={hover === null ? 'rest' : hover === i ? 'expanded' : 'shrunk'}
          onEnter={() => setHover(i)}
          onLeave={() => setHover(null)}
          onAction={onAction}
        />
      ))}
      {pair.length === 1 && <div className="hidden sm:block sm:flex-1" />}
    </div>
  );
}

export function PairedFeed({
  cards,
  onAction,
  emptyState,
}: {
  cards: FeedCardType[];
  onAction?: (c: FeedCardType, a: FeedCardAction) => void;
  emptyState?: React.ReactNode;
}) {
  if (!cards.length && emptyState) return <>{emptyState}</>;
  return (
    <div className="space-y-4">
      {chunkPairs(cards).map((pair, i) => (
        <Row key={pair.map((c) => c.id).join('-') || i} pair={pair} onAction={onAction} />
      ))}
    </div>
  );
}
