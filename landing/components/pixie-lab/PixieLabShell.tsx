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

/**
 * PixieLabShell — the authenticated Lab chrome: a left rail (For You + owned
 * agents + Agent Switcher) and a topbar (logo, tenant, user). Wraps every
 * /pixie-lab/* page. Agent status comes from entitlements (mock now → Supabase
 * later). Locked agents route to their trial/purchase page.
 */

const AGENT_ICON: Record<FeedAgent, LucideIcon> = {
  website: Globe, receptionist: Headset, seo: Search, marketing: Megaphone, content: Clapperboard, pixie: Sparkles,
};
const AGENT_ACCENT: Record<FeedAgent, string> = {
  website: '#3B82F6', receptionist: '#E6B45A', seo: '#14B8A6', marketing: '#EC4899', content: '#D4AF37', pixie: '#25D366',
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
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { stateOf } = useEntitlements(tenant);
  const stateFor = stateOf;

  const initial = (name || 'P').charAt(0).toUpperCase();

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
      <Link href="/pixie-lab/dashboard" className="flex items-center gap-2.5 px-5 py-5 font-display text-base font-extrabold tracking-tight">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#25D366] to-[#22d3ee] text-[#02070a]">
          <Sparkles size={16} strokeWidth={2.5} />
        </span>
        Pixie Lab
      </Link>

      <nav className="flex-1 space-y-1 px-3">
        <NavItem href="/pixie-lab/dashboard" icon={LayoutDashboard} label="Dashboard" active={pathname === '/pixie-lab/dashboard'} />
        <NavItem href="/pixie-lab/for-you" icon={LayoutGrid} label="For You" active={pathname === '/pixie-lab/for-you'} />

        <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-white/30">Agents</p>
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
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
              style={{ background: active ? `${accent}1f` : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.6)' }}
            >
              <Icon size={16} style={{ color: st === 'locked' ? 'rgba(255,255,255,0.35)' : accent }} />
              <span className={st === 'locked' ? 'text-white/45' : ''}>{AGENT_META[agent].label}</span>
              {st === 'locked' ? (
                <Lock size={12} className="ml-auto text-white/30" />
              ) : (
                <span
                  className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                  style={{ background: st === 'trial' ? 'rgba(139,92,246,0.18)' : `${accent}22`, color: st === 'trial' ? '#c4b5fd' : accent }}
                >
                  {STATE_LABEL[st]}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 px-3 pb-2">
        <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-white/30">Workspace</p>
        <NavItem href="/pixie-lab/approvals" icon={ShieldCheck} label="Approvals" active={pathname === '/pixie-lab/approvals'} />
        <NavItem href="/pixie-lab/activity" icon={Activity} label="Activity" active={pathname === '/pixie-lab/activity'} />
      </div>

      <button onClick={signOut} className="m-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/60 transition hover:text-white">
        <LogOut size={15} /> Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0C1512] text-white">
      <div className="mx-auto flex max-w-[1400px]">
        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-screen w-60 flex-none border-r border-white/[0.06] bg-white/[0.015] lg:block">
          {Rail}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-64 border-r border-white/10 bg-[#15211C]">
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 text-white/50"><X size={20} /></button>
              {Rail}
            </aside>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Topbar */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0C1512]/80 px-5 py-3 backdrop-blur-xl">
            <button onClick={() => setMobileOpen(true)} className="text-white/70 lg:hidden"><Menu size={20} /></button>

            {/* Agent Switcher */}
            <div className="relative">
              <button
                onClick={() => setSwitcherOpen((s) => !s)}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 hover:text-white"
              >
                Switch workspace <ChevronDown size={14} className={switcherOpen ? 'rotate-180 transition' : 'transition'} />
              </button>
              {switcherOpen && (
                <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-64 rounded-xl border border-white/12 bg-[#15211C] p-1.5 shadow-2xl">
                  {AGENTS_ORDER.map((agent) => {
                    const st = stateFor(agent);
                    const Icon = AGENT_ICON[agent];
                    const accent = AGENT_ACCENT[agent];
                    return (
                      <Link
                        key={agent}
                        href={agentHref(agent)}
                        onClick={() => setSwitcherOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/75 hover:bg-white/[0.05]"
                      >
                        <Icon size={15} style={{ color: st === 'locked' ? 'rgba(255,255,255,0.35)' : accent }} />
                        {AGENT_META[agent].label}
                        <span className="ml-auto text-[10px] uppercase tracking-wide text-white/40">{STATE_LABEL[st]}</span>
                      </Link>
                    );
                  })}
                  <Link href="/pixie-lab/for-you" onClick={() => setSwitcherOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg border-t border-white/10 px-2.5 py-2 text-sm text-[#25D366]">
                    <Sparkles size={14} /> Explore all agents
                  </Link>
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/50 sm:inline">{tenant}</span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#25D366]/80 to-[#22d3ee]/80 text-sm font-bold text-[#02070a]">{initial}</span>
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
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
      style={{ background: active ? 'rgba(37,211,102,0.14)' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.6)' }}
    >
      <Icon size={16} className={active ? 'text-[#25D366]' : ''} /> {label}
    </Link>
  );
}
