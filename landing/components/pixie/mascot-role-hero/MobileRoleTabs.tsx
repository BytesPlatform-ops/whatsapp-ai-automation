'use client';

import { useEffect, useRef } from 'react';
import { type Role } from './roleData';

/**
 * MobileRoleTabs — scrollable role chips for mobile / tablet + the
 * reduced-motion fallback. Tapping switches role (no pin, no sweep).
 *
 * `w-full` + internal `overflow-x-auto` keeps the rail constrained to the
 * viewport (it scrolls inside itself instead of widening the page → no
 * horizontal page scroll). The active chip auto-centres on change.
 */
export function MobileRoleTabs({
  roles,
  activeIndex,
  onSelect,
}: {
  roles: Role[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep the active chip in view as the role changes (scroll/tab).
  useEffect(() => {
    const chip = chipRefs.current[activeIndex];
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      ref={railRef}
      className="rail-scroll flex w-full max-w-full snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
      role="tablist"
      aria-label="Pixie roles"
    >
      {roles.map((role, i) => {
        const on = i === activeIndex;
        return (
          <button
            key={role.id}
            ref={(el) => {
              chipRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(i)}
            className="shrink-0 snap-center whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors"
            style={{
              borderColor: on ? 'rgb(var(--accent-rgb) / 0.6)' : 'rgba(255,255,255,0.12)',
              background: on ? 'rgb(var(--accent-rgb) / 0.16)' : 'rgba(255,255,255,0.03)',
              color: on ? 'var(--accent)' : 'rgba(244,255,249,0.6)',
            }}
          >
            {role.label}
          </button>
        );
      })}
    </div>
  );
}
