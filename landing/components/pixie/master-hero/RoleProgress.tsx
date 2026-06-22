'use client';

import { FLYING_ROLES } from './roleData';

/**
 * RoleProgress — fixed right-edge navigator (desktop). Dots + labels for the
 * six roles; active uses --accent. Real <button>s with aria-current; clicking
 * scrolls to that role's section.
 */
export function RoleProgress({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Pixie roles" className="flex flex-col gap-2.5">
      {FLYING_ROLES.map((role, i) => {
        const on = role.id === activeId;
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={on ? 'true' : undefined}
            className="group flex items-center justify-end gap-3 text-right"
          >
            <span
              className="text-xs font-medium tracking-wide transition-all duration-300"
              style={{ color: on ? 'var(--accent)' : 'rgba(244,255,249,0.35)', opacity: on ? 1 : 0, transform: on ? 'translateX(0)' : 'translateX(8px)' }}
            >
              {role.label}
            </span>
            <span className="relative flex h-2.5 w-2.5 items-center justify-center">
              <span
                className="h-2.5 w-2.5 rounded-full border transition-all duration-300 group-hover:scale-110"
                style={{
                  borderColor: on ? 'var(--accent)' : 'rgba(244,255,249,0.25)',
                  background: on ? 'var(--accent)' : 'transparent',
                  boxShadow: on ? '0 0 14px rgb(var(--accent-rgb) / 0.8)' : 'none',
                }}
              />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
