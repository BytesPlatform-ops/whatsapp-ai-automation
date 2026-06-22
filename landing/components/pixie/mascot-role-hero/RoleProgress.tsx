'use client';

import { type Role } from './roleData';

/**
 * RoleProgress — vertical role navigator (desktop right edge). Real <button>s
 * with `aria-current`; clicking scrolls to that role's segment (parent-handled).
 */
export function RoleProgress({
  roles,
  activeIndex,
  onSelect,
}: {
  roles: Role[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <nav aria-label="Pixie roles" className="flex flex-col gap-2.5">
      {roles.map((role, i) => {
        const on = i === activeIndex;
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
              style={{
                color: on ? 'var(--accent)' : 'rgba(244,255,249,0.35)',
                opacity: on ? 1 : 0,
                transform: on ? 'translateX(0)' : 'translateX(8px)',
              }}
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
