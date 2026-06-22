'use client';

import { memo, useState } from 'react';
import { STUDIO_BG_SRC } from './roleData';

/**
 * BackgroundLayer — the one fixed studio scene. Memoised with no changing
 * props so it NEVER re-renders on role change (acceptance criterion). Deep
 * navy gradient + optional blurred studio photo + a static ambient accent
 * bloom behind the mascot + vignette + grain. Nothing role-specific.
 */
export const BackgroundLayer = memo(function BackgroundLayer() {
  const [hasPhoto, setHasPhoto] = useState(true);

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#06202e_0%,#03111a_45%,#02070a_100%)]" />

      {hasPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- decorative bg with onError fallback
        <img
          src={STUDIO_BG_SRC}
          alt=""
          aria-hidden
          onError={() => setHasPhoto(false)}
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-[2px] brightness-[0.5]"
        />
      )}

      {/* Adaptive ambient bloom — large + soft, recolours with the active role
          via --accent-rgb (kept low-opacity so the scene stays dark/readable).
          Inline styles because the gradient needs literal spaces. */}
      <div
        className="absolute left-1/2 top-[46%] h-[68vh] w-[68vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgb(var(--accent-rgb) / 0.20) 0%, rgb(var(--accent-rgb) / 0.10) 42%, transparent 70%)',
        }}
      />
      <div
        className="absolute right-[14%] top-[20%] h-[34vh] w-[34vh] rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgb(var(--accent-rgb) / 0.10) 0%, transparent 70%)' }}
      />

      {/* Iridescent Core layer — fades in only for Omnichannel/Core mode
          (driven by --core-glow-opacity, tweened by GSAP). */}
      <div className="pixie-iridescent-core-glow absolute inset-0" />

      <div className="absolute inset-x-0 bottom-[14%] h-px bg-gradient-to-r from-transparent via-[color:color-mix(in_srgb,var(--accent-soft)_15%,transparent)] to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_42%,transparent_52%,rgba(0,0,0,0.6)_100%)]" />

      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#02070a] via-[#02070a]/70 to-transparent" />
    </div>
  );
});
