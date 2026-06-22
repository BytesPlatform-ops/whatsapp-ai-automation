'use client';

import { type Role } from './roleData';

/**
 * RoleCopy — left-side eyebrow / heading / subheading / CTAs, keyed by role id.
 * On change React remounts it and the pure-CSS `animate-fade-up` plays the
 * enter (no Framer Motion). Accent colours come from the adaptive `--accent*`
 * theme vars, so badge + primary/secondary CTAs recolour per role. Heading and
 * body stay near-white for readability; the primary CTA text uses
 * `--button-text` (luminance-picked) so it's legible on any accent.
 */
export function RoleCopy({ role, align = 'left' }: { role: Role; align?: 'left' | 'center' }) {
  const centered = align === 'center';
  return (
    <div className={centered ? 'text-center' : 'text-center lg:text-left'}>
      <div key={role.id} className="animate-fade-up">
        {/* Eyebrow badge — accent tint + border, near-white text */}
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f8fffb]"
          style={{
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            borderColor: 'color-mix(in srgb, var(--accent) 38%, transparent)',
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
          {role.eyebrow}
        </span>

        <h1 className="mt-5 max-w-xl font-display text-[clamp(2rem,4.6vw,3.6rem)] font-extrabold leading-[1.05] tracking-tight text-[#F4FFF9] text-balance">
          {role.heading}
        </h1>

        <p className={`mt-5 max-w-md text-base leading-relaxed text-[#9BAAA5] sm:text-lg ${centered ? 'mx-auto' : 'mx-auto lg:mx-0'}`}>
          {role.sub}
        </p>

        <div className={`mt-8 flex flex-col items-center gap-3 sm:flex-row ${centered ? 'sm:justify-center' : 'sm:justify-center lg:justify-start'}`}>
          {/* Primary CTA — accent fill, luminance-safe text */}
          <a
            href={role.href}
            className="group relative inline-flex h-[52px] items-center justify-center gap-2 overflow-hidden rounded-full px-7 text-sm font-semibold tracking-wide transition-transform hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: 'var(--accent)',
              color: 'var(--button-text)',
              boxShadow: '0 18px 60px color-mix(in srgb, var(--accent) 26%, transparent)',
            }}
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative z-10">{role.cta}</span>
            <svg className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
          {/* Secondary CTA — glass, accent only in border tint */}
          <a
            href="/#how"
            className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full border bg-white/[0.04] px-6 text-sm font-semibold text-white/[0.86] backdrop-blur-md transition-colors hover:text-white"
            style={{ borderColor: 'color-mix(in srgb, var(--accent) 28%, transparent)' }}
          >
            See how it works
          </a>
        </div>
      </div>
    </div>
  );
}
