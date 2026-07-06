'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * ServiceTabs — in-shell sub-navigation for a service (e.g. SEO → Overview /
 * Audit / History / Connections). Keeps every tool inside the Pixie Lab layout;
 * the active tab is derived from the pathname. Accent-tinted to match the agent.
 */
export interface ServiceTab { label: string; href: string }

export function ServiceTabs({ tabs, accent }: { tabs: ServiceTab[]; accent: string }) {
  const pathname = usePathname();
  return (
    <nav className="mt-6 flex gap-1.5 overflow-x-auto border-b border-[var(--pl-border)] pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="relative whitespace-nowrap rounded-t-lg px-3.5 py-2 text-[13.5px] font-semibold transition"
            style={active
              ? { color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }
              : { color: 'var(--pl-text-muted)' }}
          >
            {t.label}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ background: accent }} />}
          </Link>
        );
      })}
    </nav>
  );
}
