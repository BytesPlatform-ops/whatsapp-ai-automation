'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';

/**
 * BigTextReveal — the Spotify-Wrapped "big text moment". Each problem line
 * slides up + fades in on scroll (staggered), then an accented pay-off line
 * lands last. Transform/opacity only; honours prefers-reduced-motion.
 */
export function BigTextReveal({
  lines,
  reveal,
}: {
  lines: string[];
  reveal: string;
}) {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.12, delayChildren: 0.05 } },
  };
  const line: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 80 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  };
  const payoff: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 40 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.15 } },
  };

  return (
    <section className="relative mx-auto max-w-5xl px-5 py-24 sm:py-32 md:px-8">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
        className="space-y-1"
      >
        {lines.map((l, i) => (
          <motion.p
            key={i}
            variants={line}
            className="font-display text-[clamp(2.2rem,7vw,5rem)] font-extrabold leading-[1.02] tracking-tight text-white/30"
          >
            {l}
          </motion.p>
        ))}

        <motion.p
          variants={payoff}
          className="pt-6 font-display text-[clamp(2rem,6vw,4.25rem)] font-extrabold leading-[1.04] tracking-tight text-balance"
          style={{ color: 'var(--accent)' }}
        >
          {reveal}
        </motion.p>
      </motion.div>
    </section>
  );
}
