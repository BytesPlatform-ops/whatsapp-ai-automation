'use client';

import { Check } from 'lucide-react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

/**
 * StoryCardGrid — "What Pixie does for you". Glass cards reveal with a y-slide +
 * fade stagger as they scroll into view. Accent border + check chip per card.
 */
export function StoryCardGrid({
  eyebrow,
  title,
  cards,
}: {
  eyebrow: string;
  title: string;
  cards: string[];
}) {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.08 } },
  };
  const card: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 40 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <section id="how" className="relative mx-auto max-w-6xl px-5 py-20 sm:py-28 md:px-8">
      <div className="mb-10 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--soft)' }}>
          {eyebrow}
        </span>
        <h2 className="mt-3 font-display text-[clamp(1.9rem,4vw,3rem)] font-extrabold tracking-tight text-white text-balance">
          {title}
        </h2>
      </div>

      <motion.ul
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cards.map((c) => (
          <motion.li
            key={c}
            variants={card}
            className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition-colors hover:border-white/20"
            style={{ boxShadow: '0 10px 40px -24px rgba(0,0,0,0.8)' }}
          >
            <span
              className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full"
              style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
            >
              <Check className="h-4 w-4" style={{ color: 'var(--accent)' }} strokeWidth={3} />
            </span>
            <span className="text-[15px] font-medium leading-snug text-white/90">{c}</span>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
