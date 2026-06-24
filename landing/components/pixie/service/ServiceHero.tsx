'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';

/**
 * ServiceHero — problem-first hero. Eyebrow → headline (line-staggered) → sub →
 * dual CTAs rise in sequence. The full-body Pixie floats to the right on
 * desktop; the scroll-morph section directly below takes over as the user
 * scrolls. Primary CTA scrolls to the inline #setup section.
 */
export function ServiceHero({
  eyebrow,
  headline,
  sub,
  primaryCta,
  secondaryCta,
  avatar,
  serviceLabel,
  onPrimary,
  onSecondary,
}: {
  eyebrow: string;
  headline: string;
  sub: string;
  primaryCta: string;
  secondaryCta: string;
  /** Role-specific Pixie avatar (e.g. receptionist.webp), not the normal one. */
  avatar: string;
  serviceLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const reduce = useReducedMotion();

  const rise: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 28 },
    show: (i: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : 0.08 * i },
    }),
  };

  return (
    <section className="relative overflow-hidden px-5 pb-10 pt-28 sm:pt-32 md:px-8 md:pt-36">
      {/* accent glow */}
      <div
        className="pointer-events-none absolute -top-24 right-[-10%] h-[460px] w-[460px] rounded-full blur-[120px]"
        style={{ background: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}
      />
      <div className="grid-noise pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="text-center lg:text-left">
          <motion.span
            custom={0}
            variants={rise}
            initial="hidden"
            animate="show"
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{
              color: 'var(--soft)',
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              borderColor: 'color-mix(in srgb, var(--accent) 36%, transparent)',
            }}
          >
            {eyebrow}
          </motion.span>

          <motion.h1
            custom={1}
            variants={rise}
            initial="hidden"
            animate="show"
            className="mt-5 font-display text-[clamp(2.4rem,6vw,4.5rem)] font-extrabold leading-[1.03] tracking-tight text-white text-balance"
          >
            {headline}
          </motion.h1>

          <motion.p
            custom={2}
            variants={rise}
            initial="hidden"
            animate="show"
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg lg:mx-0"
          >
            {sub}
          </motion.p>

          <motion.div
            custom={3}
            variants={rise}
            initial="hidden"
            animate="show"
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
          >
            <button
              type="button"
              onClick={onPrimary}
              className="group relative inline-flex h-[54px] items-center justify-center gap-2 overflow-hidden rounded-full px-8 text-sm font-bold tracking-wide transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
              style={{
                background: 'var(--accent)',
                color: '#06110c',
                boxShadow: '0 18px 50px color-mix(in srgb, var(--accent) 30%, transparent)',
              }}
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <span className="relative z-10">{primaryCta}</span>
              <svg className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onSecondary}
              className="inline-flex h-[54px] items-center justify-center rounded-full border bg-white/[0.04] px-6 text-sm font-semibold text-white/85 backdrop-blur-md transition-colors hover:text-white"
              style={{ borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}
            >
              {secondaryCta}
            </button>
          </motion.div>
        </div>

        {/* Hero avatar — the role-specific Pixie (receptionist, website, etc.).
            Visible on every breakpoint now that the scroll-grow section is gone. */}
        <motion.div
          initial={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto h-[240px] w-[240px] sm:h-[300px] sm:w-[300px] lg:h-[360px] lg:w-[360px]"
        >
          <div
            className="absolute inset-0 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 40%, transparent) 0%, transparent 70%)' }}
          />
          <img
            src={avatar}
            alt={`${serviceLabel} — Pixie`}
            className="relative h-full w-full select-none object-contain mascot-float"
            draggable={false}
          />
        </motion.div>
      </div>
    </section>
  );
}
