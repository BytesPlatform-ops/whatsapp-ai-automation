'use client';

import { forwardRef } from 'react';

/**
 * ScanRing — accent 3D ellipse that only appears DURING a transition to mask
 * the prop swap and sell the "activation" feel. GSAP drives opacity / y / scale
 * on the forwarded node; idle = fully transparent so nothing animates at rest.
 * Pure CSS/SVG — no video. (The conic sweep uses the `rm-spin` keyframe in
 * globals.css, which is disabled under prefers-reduced-motion.)
 */
export const ScanRing = forwardRef<HTMLDivElement>(function ScanRing(_props, ref) {
  return (
    <div ref={ref} aria-hidden className="pointer-events-none opacity-0" style={{ perspective: '900px' }}>
      <div className="relative" style={{ transform: 'rotateX(66deg)' }}>
        <div className="relative h-[200px] w-[460px] sm:h-[230px] sm:w-[540px]">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: '2px solid rgb(var(--accent-rgb) / 0.85)',
              boxShadow:
                '0 0 30px rgb(var(--accent-rgb) / 0.55), 0 0 70px rgb(var(--accent-rgb) / 0.35), inset 0 0 26px rgb(var(--accent-rgb) / 0.35)',
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, rgb(var(--accent-rgb) / 0) 210deg, rgb(var(--accent-rgb) / 0.9) 320deg, rgb(var(--accent-rgb) / 0.95) 352deg, transparent 360deg)',
              WebkitMask: 'radial-gradient(closest-side, transparent calc(100% - 6px), #000 calc(100% - 5px))',
              mask: 'radial-gradient(closest-side, transparent calc(100% - 6px), #000 calc(100% - 5px))',
              animation: 'rm-spin 3.5s linear infinite',
            }}
          />
          <div className="absolute inset-0 rounded-full blur-[16px]" style={{ border: '6px solid rgb(var(--accent-rgb) / 0.4)' }} />
        </div>
      </div>
    </div>
  );
});
