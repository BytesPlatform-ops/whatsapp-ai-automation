'use client';

import { useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import {
  type FeedCard as FeedCardType,
  type FeedCardAction,
  CATEGORY_THEME,
  PRIORITY_DOT,
  AGENT_META,
} from '@/lib/pixie-lab/feed';

/**
 * FeedCard — collapsed = a 5–6 word heading + category/agent chips + priority dot.
 * Hover (desktop) or tap (mobile) expands to the full idea, why Pixie recommends
 * it, expected outcome, and the action buttons. Colorful by category, premium and
 * non-templated. Prop-driven so the global feed and per-agent feeds reuse it.
 */
export function FeedCard({
  card,
  onAction,
}: {
  card: FeedCardType;
  onAction?: (card: FeedCardType, action: FeedCardAction) => void;
}) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false); // tap-to-keep-open (mobile)
  const [done, setDone] = useState(false);

  const open = hovered || pinned;
  const theme = CATEGORY_THEME[card.category];
  const agent = AGENT_META[card.primary_agent];

  function handle(a: FeedCardAction) {
    onAction?.(card, a);
    if (a.type === 'approve' || a.type === 'do_this') {
      setDone(true);
    }
  }

  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: done ? 0 : 1, y: 0, scale: done ? 0.96 : 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setPinned((p) => !p)}
      style={{ ['--accent' as string]: theme.accent }}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md transition-colors hover:border-white/15"
    >
      {/* accent top bar */}
      <div className="h-1 w-full" style={{ background: theme.accent }} />

      {/* accent glow on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-30"
        style={{ background: theme.accent }}
      />

      <div className="p-4">
        {/* chips row */}
        <div className="mb-2.5 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
            style={{ background: `${theme.accent}1f`, color: theme.accent }}
          >
            {theme.label}
          </span>
          {card.primary_agent !== 'pixie' && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] font-medium text-white/55">
              {agent.label}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/35">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIORITY_DOT[card.priority] }} />
            {card.priority}
          </span>
        </div>

        {/* heading (always visible) */}
        <h3 className="font-display text-[15px] font-bold leading-snug tracking-tight text-white">
          {card.heading}
        </h3>

        {/* expanded body */}
        <AnimatePresence initial={false}>
          {open && !done && (
            <motion.div
              key="body"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? undefined : { height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <p className="mt-2 text-[13px] leading-relaxed text-white/70">{card.full_idea}</p>

              <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                <Sparkles size={13} className="mt-0.5 flex-none" style={{ color: theme.accent }} />
                <p className="text-[12px] leading-relaxed text-white/55">{card.reason}</p>
              </div>

              {card.outcome && (
                <p className="mt-2 text-[12px] font-medium" style={{ color: theme.accent }}>
                  → {card.outcome}
                </p>
              )}

              {/* actions */}
              <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                {card.actions.map((a, i) => {
                  const primary = i === 0;
                  return (
                    <button
                      key={a.id}
                      onClick={() => handle(a)}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-transform active:scale-[0.97]"
                      style={
                        primary
                          ? { background: theme.accent, color: '#02070a' }
                          : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }
                      }
                    >
                      {a.label}
                      {primary && <ChevronRight size={13} />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* approve confirmation flash */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 grid place-items-center"
            style={{ background: `${theme.accent}14` }}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white">
              <Check size={15} style={{ color: theme.accent }} /> Done
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
