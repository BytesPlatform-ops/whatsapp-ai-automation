'use client';

/**
 * RobotHalo — back aura + floor ring + beam that travel WITH the robot (it's
 * nested inside the flight layer). Colours come from the --accent vars. The
 * floor ring + beam fade out as the robot flies, driven by the `--flight`
 * variable (0 = landed, 1 = moving fast) set on the stage from scroll velocity.
 * The ring shimmer animates transform only (opacity is owned by --flight).
 */
export function RobotHalo() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Back aura — breathes, stays visible during flight */}
      <div
        className="mh-back-aura absolute left-1/2 top-[42%]"
        style={{
          width: 'var(--pixie-aura)',
          height: 'var(--pixie-aura)',
          background: 'radial-gradient(circle, var(--accent-glow) 0%, var(--accent-glow-soft) 35%, transparent 70%)',
        }}
      />
      {/* Soft motion trail — only appears during flight */}
      <div
        className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 'calc(var(--pixie-aura) * 0.7)',
          height: 'calc(var(--pixie-aura) * 0.45)',
          background: 'radial-gradient(ellipse, var(--accent-glow) 0%, transparent 70%)',
          opacity: 'calc(var(--flight, 0) * 0.5)',
          filter: 'blur(40px)',
        }}
      />
      {/* Floor beam — fades during flight */}
      <div
        className="absolute bottom-[16%] left-1/2 -translate-x-1/2"
        style={{
          width: 'calc(var(--pixie-ring) * 0.55)',
          height: '26%',
          background: 'linear-gradient(to top, var(--accent-glow-soft), transparent)',
          opacity: 'calc(0.22 * (1 - var(--flight, 0)))',
          filter: 'blur(26px)',
        }}
      />
      {/* Floor ring — fades during flight, reforms on landing */}
      <svg
        viewBox="0 0 420 120"
        className="absolute bottom-[13%] left-1/2 -translate-x-1/2"
        style={{ width: 'var(--pixie-ring)', height: 'auto', opacity: 'calc(0.85 - 0.6 * var(--flight, 0))' }}
      >
        <defs>
          <radialGradient id="mhRingFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter id="mhRingBlur" x="-30%" y="-60%" width="160%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g className="mh-ring-shimmer" style={{ transformOrigin: 'center' }}>
          <ellipse cx="210" cy="60" rx="165" ry="34" fill="url(#mhRingFill)" />
          <ellipse cx="210" cy="60" rx="165" ry="34" fill="none" stroke="var(--accent)" strokeOpacity="0.7" strokeWidth="1.5" />
          <ellipse cx="210" cy="60" rx="185" ry="42" fill="none" stroke="var(--accent)" strokeOpacity="0.2" strokeWidth="8" filter="url(#mhRingBlur)" />
        </g>
      </svg>
    </div>
  );
}
