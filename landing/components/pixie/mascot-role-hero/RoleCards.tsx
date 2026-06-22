'use client';

import { Check } from 'lucide-react';
import { type Role } from './roleData';

/**
 * RoleCards — readable business-outcome chips for the active role. Keyed by
 * role id so they remount on change; each staggers in via pure-CSS
 * `animate-fade-up` (~55ms apart). No Framer Motion.
 */
export function RoleCards({ role, align = 'right' }: { role: Role; align?: 'right' | 'center' }) {
  return (
    <ul key={role.id} className={`flex w-full max-w-[290px] flex-col gap-3 ${align === 'center' ? 'mx-auto' : ''}`}>
      {role.cards.map((label, i) => (
        <li
          key={label}
          className="animate-fade-up flex items-center gap-3 rounded-2xl border border-white/[0.12] bg-white/[0.055] px-4 py-3 backdrop-blur-xl"
          style={{ animationDelay: `${i * 55}ms`, marginLeft: align === 'center' ? undefined : `${(i % 2) * 18}px` }}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--accent)' }}>
            <Check className="h-3 w-3" style={{ color: 'var(--button-text)' }} strokeWidth={3} />
          </span>
          <span className="flex-1 text-sm font-medium text-white/85">{label}</span>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'color-mix(in srgb, var(--accent) 60%, transparent)' }} />
        </li>
      ))}
    </ul>
  );
}
