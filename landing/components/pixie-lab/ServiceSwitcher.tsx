'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { LayoutDashboard, ChevronDown, Lock, type LucideIcon } from 'lucide-react';
import type { FeedAgent, AgentState } from '@/lib/pixie-lab/feed';

/**
 * ServiceSwitcher — premium capsule switcher on md+ (Dashboard + every service
 * as a pill with an animated active indicator), collapsing to the compact
 * dropdown on mobile so it never gets cramped. Replaces the old
 * "Switch workspace" dropdown.
 */

interface Item {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  locked?: boolean;
}

export function ServiceSwitcher({
  agents,
  icons,
  accents,
  labels,
  stateOf,
  agentHref,
}: {
  agents: FeedAgent[];
  icons: Record<FeedAgent, LucideIcon>;
  accents: Record<FeedAgent, string>;
  labels: Record<FeedAgent, string>;
  stateOf: (a: FeedAgent) => AgentState;
  agentHref: (a: FeedAgent) => string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items: Item[] = [
    { key: 'dashboard', label: 'Dashboard', href: '/pixie-lab/dashboard', icon: LayoutDashboard, accent: '#22C55E' },
    ...agents.map((a) => ({
      key: a, label: labels[a], href: agentHref(a), icon: icons[a], accent: accents[a], locked: stateOf(a) === 'locked',
    })),
  ];
  const activeItem = items.find((it) => pathname === it.href || pathname.startsWith(it.href + '/')) ?? items[0];

  return (
    <>
      {/* Desktop / tablet: capsule */}
      <div className="hidden min-w-0 md:block">
        <div className="flex items-center gap-0.5 overflow-x-auto rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((it) => {
            const Icon = it.icon;
            const active = it.key === activeItem.key;
            return (
              <Link
                key={it.key}
                href={it.href}
                className="relative inline-flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors"
                style={{ color: active ? 'var(--pl-text)' : 'var(--pl-text-muted)' }}
              >
                {active && (
                  <motion.span
                    layoutId="switcher-active"
                    className="absolute inset-0 rounded-full border shadow-[var(--pl-shadow-sm)]"
                    style={{ background: 'var(--pl-surface)', borderColor: 'color-mix(in srgb, var(--pl-green) 40%, var(--pl-border))' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  <Icon size={15} style={{ color: active ? it.accent : undefined }} />
                  <span className="whitespace-nowrap">{it.label}</span>
                  {it.locked && <Lock size={11} className="opacity-60" />}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile: compact dropdown (kept, so it never gets cramped) */}
      <div className="relative md:hidden">
        <button
          onClick={() => setOpen((s) => !s)}
          className="flex items-center gap-2 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-1.5 text-[13px] font-semibold text-[var(--pl-text)]"
        >
          <activeItem.icon size={15} style={{ color: activeItem.accent }} />
          <span className="max-w-[120px] truncate">{activeItem.label}</span>
          <ChevronDown size={14} className={`text-[var(--pl-text-muted)] transition ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-60 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-1.5 shadow-[var(--pl-shadow)]">
              {items.map((it) => {
                const Icon = it.icon;
                const active = it.key === activeItem.key;
                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium"
                    style={{ background: active ? 'color-mix(in srgb, var(--pl-green) 12%, transparent)' : 'transparent', color: active ? 'var(--pl-text)' : 'var(--pl-text-muted)' }}
                  >
                    <Icon size={15} style={{ color: it.accent }} />
                    {it.label}
                    {it.locked && <Lock size={12} className="ml-auto opacity-60" />}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
