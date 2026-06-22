'use client';

import { Check } from 'lucide-react';
import { type FlyingRole } from './roleData';

/**
 * RolePanel — badge + heading + sub + dual CTAs + status cards for a role.
 * Accent comes from the --accent vars (recolours per role). Heading/body stay
 * near-white; primary CTA text uses luminance-picked --button-text. `active`
 * drives a block-level reveal (opacity + slide), entering from the panel side.
 */
export function RolePanel({
  role,
  side,
  active,
  reducedMotion,
  compact = false,
}: {
  role: FlyingRole;
  side: 'left' | 'right' | 'center';
  active: boolean;
  reducedMotion: boolean;
  /** Center-finale variant: smaller heading + no cards, so it clears the robot. */
  compact?: boolean;
}) {
  const Icon = role.Icon;
  const enterX = reducedMotion ? 0 : side === 'left' ? -24 : side === 'right' ? 24 : 0;
  const alignCenter = side === 'center';

  return (
    <div
      className={`max-w-md ${alignCenter ? 'text-center' : 'text-center lg:text-left'}`}
      style={{
        opacity: active ? 1 : 0,
        transform: active ? 'translate(0,0)' : `translate(${enterX}px, ${reducedMotion ? 0 : 16}px)`,
        transition: reducedMotion ? 'opacity 0.3s ease' : 'opacity 0.6s ease, transform 0.7s cubic-bezier(0.22,1,0.36,1)',
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <span
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f8fffb] ${alignCenter ? '' : 'lg:mx-0'}`}
        style={{
          background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent) 38%, transparent)',
        }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
        {role.eyebrow}
      </span>

      <h2 className={`mt-5 font-display font-extrabold leading-[1.05] tracking-tight text-[#F4FFF9] text-balance ${compact ? 'text-[clamp(1.9rem,3.4vw,2.9rem)]' : 'text-[clamp(2.25rem,4.4vw,4rem)]'}`}>
        {role.heading}
      </h2>

      <p className={`mt-4 text-base leading-relaxed text-[#9BAAA5] sm:text-lg ${alignCenter ? 'mx-auto' : 'mx-auto lg:mx-0'} max-w-md`}>
        {role.sub}
      </p>

      <div className={`mt-7 flex flex-col items-center gap-3 sm:flex-row ${alignCenter ? 'sm:justify-center' : 'sm:justify-center lg:justify-start'}`}>
        <a
          href={role.href}
          className="group relative inline-flex h-[52px] items-center justify-center gap-2 overflow-hidden rounded-full px-7 text-sm font-semibold tracking-wide transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          style={{
            background: 'var(--accent)',
            color: 'var(--button-text)',
            boxShadow: '0 18px 50px color-mix(in srgb, var(--accent) 26%, transparent)',
          }}
        >
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <span className="relative z-10">{role.primaryCta}</span>
          <svg className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
        <a
          href={role.href}
          className="inline-flex h-[52px] items-center justify-center rounded-full border bg-white/[0.04] px-6 text-sm font-semibold text-white/[0.86] backdrop-blur-md transition-colors hover:text-white"
          style={{ borderColor: 'color-mix(in srgb, var(--accent) 28%, transparent)' }}
        >
          {role.secondaryCta}
        </a>
      </div>

      <ul className={`mt-7 flex flex-wrap gap-2 ${alignCenter ? 'justify-center' : 'justify-center lg:justify-start'} ${compact ? 'hidden' : ''}`}>
        {role.cards.map((c) => (
          <li
            key={c}
            className="flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.055] px-3 py-2 text-xs font-medium text-white/85 backdrop-blur-xl"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: 'var(--accent)' }}>
              <Check className="h-2.5 w-2.5" style={{ color: 'var(--button-text)' }} strokeWidth={3} />
            </span>
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}
