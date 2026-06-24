'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ServiceRelated } from '@/lib/pixieServices';

/**
 * ServiceFinalCTA — closing band. A last accent-glow push into the setup
 * section plus "related Pixie modes" links that keep the user inside the
 * ecosystem instead of bouncing.
 */
export function ServiceFinalCTA({
  headline,
  ctaLabel,
  onPrimary,
  related,
  avatar,
  serviceLabel,
}: {
  headline: string;
  ctaLabel: string;
  onPrimary: () => void;
  related: ServiceRelated[];
  /** Role-specific Pixie avatar, repeated here as the closing visual anchor. */
  avatar: string;
  serviceLabel: string;
}) {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden px-5 py-24 sm:py-32 md:px-8">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px]"
        style={{ background: 'color-mix(in srgb, var(--accent) 26%, transparent)' }}
      />
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-auto max-w-3xl text-center"
      >
        <div className="relative mx-auto mb-8 h-[180px] w-[180px] sm:h-[220px] sm:w-[220px]">
          <div
            className="absolute inset-0 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent) 0%, transparent 70%)' }}
          />
          <img
            src={avatar}
            alt={`${serviceLabel} — Pixie`}
            className="relative h-full w-full select-none object-contain mascot-float"
            draggable={false}
          />
        </div>
        <h2 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tight text-white text-balance">
          {headline}
        </h2>
        <button
          type="button"
          onClick={onPrimary}
          className="group relative mt-8 inline-flex h-[56px] items-center justify-center gap-2 overflow-hidden rounded-full px-9 text-sm font-bold tracking-wide transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          style={{
            background: 'var(--accent)',
            color: '#06110c',
            boxShadow: '0 20px 60px color-mix(in srgb, var(--accent) 34%, transparent)',
          }}
        >
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <span className="relative z-10">{ctaLabel}</span>
        </button>

        {related.length > 0 && (
          <div className="mt-14">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">Explore more Pixie modes</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {related.map((r) => (
                <a
                  key={r.href}
                  href={r.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:border-white/25 hover:text-white"
                >
                  {r.label}
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </section>
  );
}
