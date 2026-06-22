'use client';

import { MOBILE_ROLES } from './mobileContent';

/**
 * MobileProgressRail — fixed right-edge dots (one per role). Active dot
 * elongates + uses the active --accent (inherited from :root). 44px tap
 * targets; tapping scrolls to that scene.
 */
export function MobileProgressRail({
  activeIndex,
  onSelect,
}: {
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <nav className="m-rail" aria-label="Pixie roles">
      {MOBILE_ROLES.map((role, i) => {
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
