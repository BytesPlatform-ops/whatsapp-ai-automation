'use client';

import { motion } from 'framer-motion';

// Self-drawing checkmark inside a pulsing ring. Hero element for the
// thank-you page — designed to feel calm and confident, not cheesy.
export function AnimatedCheck() {
  return (
    <div className="relative mx-auto flex h-32 w-32 items-center justify-center sm:h-40 sm:w-40">
      {/* Outer pulse ring */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-wa-green/20 blur-xl"
      />
      <motion.span
        aria-hidden
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.9, 1.25, 1.1], opacity: [0, 0.5, 0] }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
        className="absolute inset-0 rounded-full border-2 border-wa-green"
      />

      {/* Inner disc */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
        className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-wa-green to-wa-teal shadow-[0_20px_60px_-15px_rgba(37,211,102,0.6)] sm:h-28 sm:w-28"
      >
        {/* Drawn checkmark */}
        <svg
          viewBox="0 0 52 52"
          className="h-12 w-12 sm:h-14 sm:w-14"
          fill="none"
          stroke="white"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="M14 27 l8 8 l16 -18"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.45 }}
          />
        </svg>
      </motion.div>
    </div>
  );
}
