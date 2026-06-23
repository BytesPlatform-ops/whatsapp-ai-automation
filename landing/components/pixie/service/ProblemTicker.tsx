'use client';

/**
 * ProblemTicker — an infinite horizontal marquee of page-specific phrases.
 * Pure CSS (transform-only) for a lightweight, GPU-friendly loop; the track is
 * duplicated so the -50% translate wraps seamlessly. Pauses on hover and under
 * prefers-reduced-motion (see .pixie-marquee* in globals.css).
 */
export function ProblemTicker({
  items,
  durationSec = 28,
  reverse = false,
}: {
  items: string[];
  durationSec?: number;
  reverse?: boolean;
}) {
  // Duplicate the list once so the keyframe's -50% shift loops with no gap.
  const doubled = [...items, ...items];

  return (
    <div
      className={`pixie-marquee relative w-full overflow-hidden border-y border-white/10 py-4 ${
        reverse ? 'pixie-marquee-reverse' : ''
      }`}
      style={{ ['--marquee-duration' as string]: `${durationSec}s` }}
      aria-hidden="true"
    >
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#070b14] to-transparent sm:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#070b14] to-transparent sm:w-24" />

      <div className="pixie-marquee-track">
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center">
            <span className="px-4 text-sm font-semibold uppercase tracking-[0.22em] text-white/75 sm:text-base">
              {item}
            </span>
            <span
              className="px-2 text-lg leading-none"
              style={{ color: 'var(--accent)' }}
            >
              •
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
