'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';

/**
 * RequirementsCards — "What we need from you". Compact 1–2 line chips so the
 * setup feels low-friction (these are guidance, not form fields). Numbered for
 * scannability; reveal with a light stagger.
 */
export function RequirementsCards({ items }: { items: string[] }) {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.06 } },
  };
  const chip: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <section className="relative mx-auto max-w-5xl px-5 py-16 sm:py-20 md:px-8">
      <div className="mb-8 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--soft)' }}>
          QUICK START
        </span>
        <h2 className="mt-3 font-display text-[clamp(1.7rem,3.5vw,2.5rem)] font-extrabold tracking-tight text-white">
          What Pixie needs from you
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-white/55">
          Just a few details to get started — no long brief, no heavy forms.
        </p>
      </div>

      <motion.ul
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {items.map((item, i) => (
          <motion.li
            key={item}
            variants={chip}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 backdrop-blur-md"
          >
            <span
              className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-[11px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--soft)' }}
            >
              {i + 1}
            </span>
            <span className="text-sm font-medium text-white/85">{item}</span>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
