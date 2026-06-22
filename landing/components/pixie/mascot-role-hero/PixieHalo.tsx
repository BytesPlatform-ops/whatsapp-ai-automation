'use client';

/**
 * PixieHalo — the premium glow system that frames + grounds the mascot.
 * All colours come from the `--pixie-*` theme tokens (globals.css) — there are
 * NO hardcoded glow colours here. Pure CSS/SVG, fully decorative (aria-hidden).
 *
 * Stack:
 *   • back aura      — large soft circle behind the mascot (breathes slowly)
 *   • chest-core aura— tighter glow behind the torso for depth
 *   • floor beam     — faint vertical column grounding the mascot
 *   • floor ring     — flattened holographic disc under the base (shimmers,
 *                      independent of the mascot's float)
 *
 * Sizes are driven by CSS vars (--pixie-aura / --pixie-ring) set on the stage,
 * so it scales responsively. Vertical positions are tunable via the inline
 * top/bottom offsets below.
 */
export function PixieHalo() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Back aura — large + soft, breathing */}
      <div
        className="pixie-back-aura absolute left-1/2 top-[44%]"
        style={{
          width: 'var(--pixie-aura)',
          height: 'var(--pixie-aura)',
          background:
            'radial-gradient(circle, var(--accent-glow) 0%, var(--accent-glow-soft) 35%, transparent 70%)',
        }}
      />

      {/* Chest / core aura — tighter, lower opacity */}
      <div
        className="pixie-chest-core-aura absolute left-1/2 top-[48%]"
        style={{
          width: 'calc(var(--pixie-aura) * 0.55)',
          height: 'calc(var(--pixie-aura) * 0.55)',
          background: 'radial-gradient(circle, var(--accent-glow-soft) 0%, transparent 65%)',
        }}
      />

      {/* Floor beam — faint vertical column rising from the ring */}
      <div
        className="absolute bottom-[15%] left-1/2 -translate-x-1/2"
        style={{
          width: 'calc(var(--pixie-ring) * 0.55)',
          height: '30%',
          background: 'linear-gradient(to top, var(--accent-glow-soft), transparent)',
          opacity: 0.22,
          filter: 'blur(28px)',
        }}
      />

      {/* Floor ring — flattened holographic disc, shimmering, FIXED (no float) */}
      <svg
        viewBox="0 0 420 120"
        className="pixie-floor-ring absolute bottom-[12%] left-1/2 -translate-x-1/2"
        style={{ width: 'var(--pixie-ring)', height: 'auto' }}
      >
        <defs>
          <radialGradient id="pixieRingFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter id="pixieRingBlur" x="-30%" y="-60%" width="160%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        {/* soft inner fill */}
        <ellipse cx="210" cy="60" rx="165" ry="34" fill="url(#pixieRingFill)" />
        {/* crisp thin stroke */}
        <ellipse cx="210" cy="60" rx="165" ry="34" fill="none" stroke="var(--accent)" strokeOpacity="0.7" strokeWidth="1.5" />
        {/* blurred bloom duplicate */}
        <ellipse cx="210" cy="60" rx="185" ry="42" fill="none" stroke="var(--accent)" strokeOpacity="0.2" strokeWidth="8" filter="url(#pixieRingBlur)" />
      </svg>
    </div>
  );
}
