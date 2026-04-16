'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

// Subtle one-time confetti — 24 particles in WhatsApp green + teal + gold,
// radiating outward with varied distance/rotation. No canvas, no extra deps,
// self-contained. Not a loop — runs once on mount and fades.
export function ConfettiBurst() {
  const particles = useMemo(() => {
    const colors = ['#25D366', '#128C7E', '#D4AF37', '#FFFFFF'];
    return Array.from({ length: 28 }, (_, i) => {
      const angle = (i / 28) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 110 + Math.random() * 130;
      return {
        id: i,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance * 0.9,
        rotate: Math.random() * 360,
        delay: Math.random() * 0.12,
        duration: 1.1 + Math.random() * 0.7,
        color: colors[i % colors.length],
        size: 5 + Math.random() * 5,
        shape: i % 3 === 0 ? 'square' : 'circle',
      };
    });
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[180px] z-20 h-0 w-0 sm:top-[210px]"
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.6, rotate: 0 }}
          animate={{
            x: p.dx,
            y: p.dy,
            opacity: [0, 1, 1, 0],
            scale: [0.6, 1, 1, 0.8],
            rotate: p.rotate,
          }}
          transition={{
            duration: p.duration,
            delay: 0.4 + p.delay,
            ease: [0.17, 0.67, 0.35, 1],
            times: [0, 0.1, 0.75, 1],
          }}
          className="absolute"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '1px',
            boxShadow: `0 0 10px ${p.color}60`,
          }}
        />
      ))}
    </div>
  );
}
