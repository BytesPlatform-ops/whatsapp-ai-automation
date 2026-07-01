'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sparkles, LayoutGrid, LayoutDashboard, Globe, Headset, Search, Megaphone, Clapperboard,
  Lock, ChevronDown, LogOut, Menu, X, ShieldCheck, Activity, type LucideIcon,
} from 'lucide-react';
import { AGENT_META, type FeedAgent, type AgentState } from '@/lib/pixie-lab/feed';
import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { ThemeToggle } from './theme/ThemeToggle';
import { ServiceSwitcher } from './ServiceSwitcher';
import { ProfileMenu } from './ProfileMenu';

/**
 * PixieLabShell — the authenticated Lab chrome: a left rail (Dashboard, For You,
 * owned agents, workspace) and a topbar (service switcher, theme toggle, profile
 * menu). Wraps every /pixie-lab/* page and is fully theme-aware via the --pl-*
 * design tokens (default light / soft mint, dark optional). Agent status comes
 * from entitlements; locked agents route to their trial/purchase page.
 */

const AGENT_ICON: Record<FeedAgent, LucideIcon> = {
  website: Globe, receptionist: Headset, seo: Search, marketing: Megaphone, content: Clapperboard, pixie: Sparkles,
};
const AGENT_ACCENT: Record<FeedAgent, string> = {
  website: '#3B82F6', receptionist: '#E6B45A', seo: '#14B8A6', marketing: '#EC4899', content: '#D4AF37', pixie: '#22C55E',
};
const STATE_LABEL: Record<AgentState, string> = { active: 'Active', trial: 'Trial', locked: 'Locked' };

const AGENTS_ORDER: FeedAgent[] = ['website', 'receptionist', 'seo', 'marketing', 'content'];

export function PixieLabShell({
  name,
  tenant,
  children,
}: {
  name: string;
  tenant: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { stateOf } = useEntitlements(tenant);
  const stateFor = stateOf;

  async function signOut() {
    try {
      if (supabaseConfigured()) await createClient().auth.signOut();
    } catch {/* ignore */}
    router.replace('/login');
    router.refresh();
  }

  function agentHref(agent: FeedAgent): string {
    const st = stateFor(agent);
    return st === 'locked' ? `/pixie-lab/trial/${agent}` : `/pixie-lab/agents/${agent}`;
  }

  const Rail = (
    <div className="flex h-full flex-col">
      <Link href="/pixie-lab/dashboard" className="flex items-center gap-2.5 px-5 py-5 font-display text-base font-extrabold tracking-tight text-[var(--pl-text)]">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#0EA5A3] text-white shadow-[0_8px_20px_-6px_rgba(34,197,94,0.55)] ring-1 ring-white/25">
          <Sparkles size={17} strokeWidth={2.5} />
        </span>
        Pixie Lab
      </Link>

      <nav className="flex-1 space-y-1 px-3">
        <NavItem href="/pixie-lab/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === '/pixie-lab/dashboard'} />
        <NavItem href="/pixie-lab/for-you" icon={LayoutGrid} label="For You" active={pathname === '/pixie-lab/for-you'} />

        <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Agents</p>
        {AGENTS_ORDER.map((agent) => {
          const st = stateFor(agent);
          const Icon = AGENT_ICON[agent];
          const accent = AGENT_ACCENT[agent];
          const active = pathname === `/pixie-lab/agents/${agent}`;
          return (
            <Link
              key={agent}
              href={agentHref(agent)}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
              style={{
                background: active ? `color-mix(in srgb, ${accent} 15%, transparent)` : 'transparent',
                color: active ? 'var(--pl-text)' : 'var(--pl-text-muted)',
              }}
            >
              <Icon size={16} style={{ color: st === 'locked' ? 'var(--pl-text-muted)' : accent }} />
              <span>{AGENT_META[agent].label}</span>
              {st === 'locked' ? (
                <Lock size={12} className="ml-auto text-[var(--pl-text-muted)]" />
              ) : (
                <span
                  className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                  style={{ background: st === 'trial' ? 'rgba(139,92,246,0.18)' : `color-mix(in srgb, ${accent} 16%, transparent)`, color: st === 'trial' ? '#8b5cf6' : accent }}
                >
                  {STATE_LABEL[st]}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 px-3 pb-2">
        <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Workspace</p>
        <NavItem href="/pixie-lab/approvals" icon={ShieldCheck} label="Approvals" active={pathname === '/pixie-lab/approvals'} />
        <NavItem href="/pixie-lab/activity" icon={Activity} label="Activity" active={pathname === '/pixie-lab/activity'} />
      </div>

      <button onClick={signOut} className="m-3 flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-sm font-medium text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)] hover:border-[var(--pl-border-strong)]">
        <LogOut size={15} /> Sign out
      </button>
    </div>
  );

  return (
    <div className="pl-themed min-h-screen text-[var(--pl-text)]" style={{ background: 'var(--pl-bg-grad)' }}>
      <div className="mx-auto flex max-w-[1600px]">
        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-screen w-60 flex-none border-r border-[var(--pl-border)] bg-[var(--pl-surface)] lg:block">
          {Rail}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-64 border-r border-[var(--pl-border)] bg-[var(--pl-surface)]">
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 text-[var(--pl-text-muted)]"><X size={20} /></button>
              {Rail}
            </aside>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Topbar */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--pl-border)] px-4 py-2.5 backdrop-blur-xl sm:px-5" style={{ background: 'color-mix(in srgb, var(--pl-bg) 82%, transparent)' }}>
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="text-[var(--pl-text-muted)] lg:hidden"><Menu size={20} /></button>
              {/* Desktop: capsule switcher. Mobile: dropdown (inside ServiceSwitcher). */}
              <ServiceSwitcher
                agents={AGENTS_ORDER}
                icons={AGENT_ICON}
                accents={AGENT_ACCENT}
                labels={Object.fromEntries(AGENTS_ORDER.map((a) => [a, AGENT_META[a].label])) as Record<FeedAgent, string>}
                stateOf={stateFor}
                agentHref={agentHref}
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-1.5 text-xs font-medium text-[var(--pl-text-muted)] sm:inline">{tenant}</span>
              <ThemeToggle />
              <ProfileMenu name={name} tenant={tenant} onSignOut={signOut} />
            </div>
          </header>

          {children}
        </div>
      </div>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: LucideIcon; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
      style={{
        background: active ? 'color-mix(in srgb, var(--pl-green) 14%, transparent)' : 'transparent',
        color: active ? 'var(--pl-text)' : 'var(--pl-text-muted)',
      }}
    >
      <Icon size={16} style={{ color: active ? 'var(--pl-green)' : undefined }} /> {label}
    </Link>
  );
}
