'use client';

import { forwardRef, useState } from 'react';
import { type Role } from './roleData';

/**
 * MascotLayer — the Pixie robot mascot at centre, showing the ACTIVE role's
 * transparent "form" cutout. The robot identity stays the same across roles;
 * only the form (accessories/styling) changes, cross-fading behind the scan
 * sweep so it reads as the same Pixie shifting roles.
 *
 * Transform separation (no conflicts):
 *   • forwarded ref  → GSAP scale pulse (1→1.03) on transition
 *   • inner wrapper  → CSS `mascot-float` idle bob (disabled if !idle)
 *   • keyed <img>    → opacity cross-fade on role change
 *
 * Fixed box (object-contain) so swapping forms never shifts layout. Falls back
 * to a CSS robot placeholder if a form asset is missing.
 */
export const MascotLayer = forwardRef<HTMLDivElement, { role: Role; idle?: boolean; fill?: boolean }>(
  function MascotLayer({ role, idle = true, fill = false }, scaleRef) {
    // `fill` (static/mobile): scale to the parent box. Otherwise (desktop):
    // size by the --mascot-width token.
    const floatStyle = fill
      ? { width: '100%', height: '100%' }
      : { width: 'var(--mascot-width)', maxWidth: '92vw' };
    return (
      <div className="relative flex h-full w-full items-center justify-center">
        {/* GSAP scale wrapper */}
        <div ref={scaleRef} className="relative z-10 flex h-full w-full items-center justify-center will-change-transform">
          {/* CSS idle-float wrapper */}
          <div className={`relative flex items-center justify-center ${idle ? 'mascot-float' : ''}`} style={floatStyle}>
            <MascotImage role={role} fill={fill} />
          </div>
        </div>
      </div>
    );
  },
);

function MascotImage({ role, fill }: { role: Role; fill: boolean }) {
  const [errored, setErrored] = useState(false);
  if (errored) return <RobotPlaceholder />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- art-directed transparent
    // mascot cutout; we need onError to fall back to the CSS placeholder.
    <img
      key={role.id}
      src={role.image}
      alt={`Pixie AI assistant in ${role.label} form`}
      onError={() => setErrored(true)}
      draggable={false}
      className={`pixie-fade-in relative z-10 select-none object-contain drop-shadow-[0_32px_60px_rgba(0,0,0,0.5)] ${
        fill ? 'h-full w-full' : 'h-auto w-full'
      }`}
      style={fill ? undefined : { maxHeight: 'min(74vh, 720px)' }}
    />
  );
}

/** CSS/SVG robot-orb placeholder if a form asset is missing. */
function RobotPlaceholder() {
  return (
    <svg viewBox="0 0 240 320" className="h-[58vh] w-auto drop-shadow-[0_30px_70px_rgba(0,0,0,0.6)]" role="img" aria-label="Pixie mascot placeholder">
      <defs>
        <linearGradient id="mascot-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b2b33" />
          <stop offset="55%" stopColor="#0f1d23" />
          <stop offset="100%" stopColor="#081218" />
        </linearGradient>
        <radialGradient id="mascot-visor" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="var(--accent-soft)" />
          <stop offset="60%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="#0c7a52" />
        </radialGradient>
      </defs>
      <line x1="120" y1="34" x2="120" y2="14" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="120" cy="11" r="5" fill="var(--accent)" />
      <rect x="56" y="34" width="128" height="104" rx="34" fill="url(#mascot-body)" stroke="var(--accent)" strokeOpacity="0.25" strokeWidth="2" />
      <rect x="72" y="58" width="96" height="56" rx="26" fill="url(#mascot-visor)" opacity="0.92" />
      <circle cx="104" cy="86" r="7" fill="var(--button-text)" />
      <circle cx="136" cy="86" r="7" fill="var(--button-text)" />
      <rect x="108" y="136" width="24" height="16" rx="6" fill="#0f1d23" />
      <rect x="64" y="150" width="112" height="120" rx="32" fill="url(#mascot-body)" stroke="var(--accent)" strokeOpacity="0.22" strokeWidth="2" />
      <circle cx="120" cy="200" r="20" fill="none" stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="120" cy="200" r="9" fill="var(--accent)" />
      <rect x="40" y="158" width="18" height="78" rx="9" fill="url(#mascot-body)" />
      <rect x="182" y="158" width="18" height="78" rx="9" fill="url(#mascot-body)" />
    </svg>
  );
}
