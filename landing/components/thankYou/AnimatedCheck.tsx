'use client';

import { motion } from 'framer-motion';

// The hero moment. Calm but substantial — the checkmark is the emotional anchor
// of the page so it gets a layered treatment: outer aura, multiple pulse rings,
// a gradient disc, and a hand-drawn stroke. Nothing cheesy, all calibrated.
export function AnimatedCheck() {
  return (
    <div className="relative mx-auto flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48">
      {/* Outer aura — largest glow layer. Tighter scale so it doesn't
          bleed too far above and create a visual gap from the pill above. */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-wa-green/25 blur-3xl scale-110"
      />
      {/* Mid aura */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-wa-green/30 blur-2xl"
      />

      {/* Two pulse rings at different delays for depth */}
      <motion.span
        aria-hidden
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: [0.9, 1.35, 1.15], opacity: [0, 0.55, 0] }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
        className="absolute inset-0 rounded-full border-2 border-wa-green"
      />
      <motion.span
        aria-hidden
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: [0.9, 1.5, 1.3], opacity: [0, 0.3, 0] }}
        transition={{ duration: 2.1, ease: 'easeOut', delay: 0.3 }}
        className="absolute inset-0 rounded-full border border-wa-green/60"
      />

      {/* Inner disc with gradient + inset shadow for depth */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18, delay: 0.1 }}
        className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-wa-green via-wa-green to-wa-teal shadow-[0_25px_70px_-12px_rgba(37,211,102,0.75),inset_0_2px_8px_rgba(255,255,255,0.25),inset_0_-3px_10px_rgba(0,0,0,0.15)] sm:h-32 sm:w-32"
      >
        {/* Highlight shine on top */}
        <span
          aria-hidden
          className="absolute inset-x-4 top-2 h-4 rounded-full bg-white/25 blur-md"
        />

        {/* Drawn checkmark */}
        <svg
          viewBox="0 0 52 52"
          className="relative h-14 w-14 sm:h-16 sm:w-16 drop-shadow-[0_2px_4px_rgba(0,0,0,0.2)]"
          fill="none"
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="M14 27 l8 8 l16 -18"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1], delay: 0.5 }}
          />
        </svg>
      </motion.div>
    </div>
  );
}
