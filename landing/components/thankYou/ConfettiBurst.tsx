'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

// One-time confetti — 44 particles in WA green, teal, gold, white radiating
// outward with varied distance, rotation, and gravity drop. No canvas, no
// extra deps. Runs once on mount and fades naturally.
export function ConfettiBurst() {
  const particles = useMemo(() => {
    const colors = ['#25D366', '#128C7E', '#D4AF37', '#FFFFFF', '#1EBE5D'];
    return Array.from({ length: 44 }, (_, i) => {
      const angle = (i / 44) * Math.PI * 2 + Math.random() * 0.6;
      const distance = 140 + Math.random() * 200;
      const gravity = 60 + Math.random() * 80;
      return {
        id: i,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance * 0.7 + gravity,
        rotate: (Math.random() - 0.5) * 720,
        delay: Math.random() * 0.18,
        duration: 1.4 + Math.random() * 1.1,
        color: colors[i % colors.length],
        size: 5 + Math.random() * 7,
        shape: i % 4 === 0 ? 'square' : i % 4 === 1 ? 'rect' : 'circle',
      };
    });
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[220px] z-20 h-0 w-0 sm:top-[260px]"
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
          animate={{
            x: p.dx,
            y: p.dy,
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1.1, 1, 0.8],
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
            width: p.shape === 'rect' ? p.size * 1.6 : p.size,
            height: p.shape === 'rect' ? p.size * 0.5 : p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '1.5px',
            boxShadow: `0 0 14px ${p.color}70`,
          }}
        />
      ))}
    </div>
  );
}
