'use client';

import { type Role } from './roleData';
import { HolographicProp } from './HolographicProp';

/**
 * PropsLayer — the role-specific holographic props orbiting the mascot.
 * This is the layer that actually MORPHS per role. Props are positioned in a
 * centred band hugging the mascot (so they stay clear of the left copy and
 * right cards). Keyed by role id → remounts on change; each prop staggers in
 * via the pure-CSS `animate-fade-up` (~60ms apart). No Framer Motion.
 *
 * `compact` renders a simple wrap row for mobile instead of absolute orbits.
 */

// Balanced orbit slots around the mascot (desktop). First 3 form a triangle.
const SLOTS = [
  'top-[16%] left-[4%]',
  'top-[20%] right-[4%]',
  'bottom-[20%] right-[8%]',
  'bottom-[18%] left-[8%]',
  'top-[46%] left-[-2%]',
  'top-[44%] right-[-2%]',
];

// Gentle per-slot parallax drift baked into the idle float (decorative).
const DRIFTS = ['rm-drift-a', 'rm-drift-b', 'rm-drift-c', 'rm-drift-a', 'rm-drift-b', 'rm-drift-c'];

export function PropsLayer({ role, compact = false }: { role: Role; compact?: boolean }) {
  if (compact) {
    return (
      <div key={role.id} className="flex flex-wrap justify-center gap-3">
        {role.props.map((p, i) => (
          <div key={`${role.id}-${p.type}`} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <HolographicProp type={p.type} label={p.label} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="pointer-events-none relative mx-auto h-full w-full max-w-[820px]">
      {role.props.map((p, i) => (
        <div
          key={`${role.id}-${p.type}`}
          className={`animate-fade-up absolute ${SLOTS[i % SLOTS.length]} ${DRIFTS[i % DRIFTS.length]}`}
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <HolographicProp type={p.type} label={p.label} />
        </div>
      ))}
    </div>
  );
}
