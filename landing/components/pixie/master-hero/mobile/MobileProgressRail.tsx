'use client';

import type { MobileRole } from './mobileContent';

/**
 * MobileProgressRail — fixed dots, one per scene (intro + roles), laid out
 * horizontally across the TOP on mobile. Active dot elongates + uses the active
 * --accent (inherited from :root). Tapping scrolls to that scene.
 */
export function MobileProgressRail({
  items,
  activeIndex,
  onSelect,
}: {
  items: MobileRole[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <nav className="m-rail" aria-label="Pixie roles">
      {items.map((role, i) => {
        const on = i === activeIndex;
        return (
          <button
            key={role.id}
            type="button"
            className="m-rail-btn"
            aria-label={`Go to ${role.label} section`}
            aria-current={on ? 'true' : undefined}
            onClick={() => onSelect(i)}
          >
            <span className={`m-rail-dot${on ? ' is-active' : ''}`} />
          </button>
        );
      })}
    </nav>
  );
}
