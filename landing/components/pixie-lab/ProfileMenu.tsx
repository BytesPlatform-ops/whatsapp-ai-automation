'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, User, Settings, KeyRound, CreditCard, Building2, Bell, LifeBuoy, LogOut, type LucideIcon,
} from 'lucide-react';

/** ProfileMenu — the top-right avatar dropdown. Initials avatar + chevron; a
 *  menu of account/workspace links (all inside Pixie Lab) + sign out. */

const ITEMS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'View Profile', href: '/pixie-lab/profile', icon: User },
  { label: 'Account Settings', href: '/pixie-lab/profile#account', icon: Settings },
  { label: 'Change Password', href: '/pixie-lab/profile#password', icon: KeyRound },
  { label: 'Billing / Plan', href: '/pixie-lab/profile#billing', icon: CreditCard },
  { label: 'Workspace Settings', href: '/pixie-lab/profile#workspace', icon: Building2 },
  { label: 'Notifications', href: '/pixie-lab/profile#notifications', icon: Bell },
  { label: 'Help / Support', href: '/pixie-lab/profile#help', icon: LifeBuoy },
];

export function ProfileMenu({ name, tenant, onSignOut }: { name: string; tenant: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const initial = (name || 'P').charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1.5 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] py-1 pl-1 pr-2 transition hover:border-[var(--pl-border-strong)]"
        aria-label="Open profile menu"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#22C55E] to-[#0EA5A3] text-sm font-bold text-white">{initial}</span>
        <ChevronDown size={14} className={`text-[var(--pl-text-muted)] transition ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 overflow-hidden rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-1.5 shadow-[var(--pl-shadow)]"
            >
              <div className="flex items-center gap-3 rounded-xl bg-[var(--pl-surface-soft)] px-3 py-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#22C55E] to-[#0EA5A3] text-sm font-bold text-white">{initial}</span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-[var(--pl-text)]">{name || 'Your account'}</p>
                  <p className="truncate text-[11.5px] text-[var(--pl-text-muted)]">{tenant}</p>
                </div>
              </div>

              <div className="mt-1">
                {ITEMS.map((it) => {
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.label}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--pl-text-soft)] transition hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]"
                    >
                      <Icon size={15} className="text-[var(--pl-text-muted)]" /> {it.label}
                    </Link>
                  );
                })}
              </div>

              <button
                onClick={() => { setOpen(false); onSignOut(); }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-xl border-t border-[var(--pl-border)] px-3 py-2.5 text-[13px] font-semibold text-[#ef4444] transition hover:bg-[color-mix(in_srgb,#ef4444_10%,transparent)]"
              >
                <LogOut size={15} /> Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
