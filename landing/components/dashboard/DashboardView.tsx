'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Headset,
  Globe,
  Megaphone,
  Clapperboard,
  Search,
  MessagesSquare,
  Sparkles,
  ArrowUpRight,
  LogOut,
  CircleDot,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { PIXIE_SERVICES, SERVICE_SLUGS, type ServiceConfig } from '@/lib/pixieServices';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

const SERVICE_ICONS: Record<string, LucideIcon> = {
  'ai-receptionist': Headset,
  'website-builder': Globe,
  'social-media-marketing': Megaphone,
  'ai-influencer': Clapperboard,
  'seo-audit': Search,
  'omnichannel-ai': MessagesSquare,
};

const ORDER = [
  'ai-receptionist',
  'website-builder',
  'social-media-marketing',
  'ai-influencer',
  'seo-audit',
  'omnichannel-ai',
];

function orderedServices(): ServiceConfig[] {
  const inOrder = ORDER.filter((s) => SERVICE_SLUGS.includes(s));
  const extras = SERVICE_SLUGS.filter((s) => !inOrder.includes(s));
  return [...inOrder, ...extras].map((slug) => PIXIE_SERVICES[slug]).filter(Boolean);
}

// ── readiness (mirrors app/api/services/readiness/route.ts) ───────────────────
type ServiceState = 'live' | 'partial' | 'setup' | 'unavailable';
interface ServiceReadiness {
  slug: string;
  channelsReady: number;
  channelsLive: number;
  missing: string[];
  state: ServiceState;
}
interface ReadinessResponse {
  tenant: string;
  backendUp: boolean;
  services: Record<string, ServiceReadiness>;
}

const STATE_META: Record<ServiceState, { label: string; dot: string; cls: string }> = {
  live: { label: 'Live', dot: '#25D366', cls: 'text-[#7ef0a8] border-[#25D366]/30 bg-[#25D366]/10' },
  partial: { label: 'Partial', dot: '#fbbf24', cls: 'text-amber-200 border-amber-400/30 bg-amber-400/10' },
  setup: { label: 'Set up', dot: '#94a3b8', cls: 'text-slate-200 border-white/15 bg-white/[0.05]' },
  unavailable: { label: 'Offline', dot: '#64748b', cls: 'text-slate-400 border-white/10 bg-white/[0.03]' },
};

function useReadiness(tenant: string) {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/services/readiness?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setData(j))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tenant]);
  return { data, loading };
}

export function DashboardView({
  tenant,
  name,
  email,
  authed,
}: {
  tenant: string;
  name: string;
  email: string;
  authed: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const services = useMemo(orderedServices, []);
  const { data, loading } = useReadiness(tenant);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      if (supabaseConfigured()) await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    router.replace('/login');
    router.refresh();
  }

  const liveCount = data ? Object.values(data.services).filter((s) => s.state === 'live').length : 0;
  const initial = (name || 'P').charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen bg-[#05070d] text-white">
      {/* ambient glow */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px]"
        style={{ background: 'radial-gradient(80% 100% at 50% 0%, rgba(37,211,102,0.12), transparent 60%)' }}
      />

      {/* ── top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#05070d]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2.5 font-display text-base font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#25D366] to-[#22d3ee] text-[#05070d]">
              <Sparkles size={16} strokeWidth={2.5} />
            </span>
            Pixie
            <span className="ml-1 hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45 sm:inline">
              Dashboard
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55 sm:flex">
              <CircleDot size={12} className="text-[#25D366]" /> {tenant}
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#25D366]/80 to-[#22d3ee]/80 text-sm font-bold text-[#05070d]">
              {initial}
            </span>
            <button
              onClick={signOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-60"
            >
              {signingOut ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
        {/* ── welcome ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[2.1rem] font-extrabold leading-tight tracking-tight">
              Welcome back, <span className="bg-gradient-to-r from-[#25D366] to-[#7dd3fc] bg-clip-text text-transparent">{name}</span> 👋
            </h1>
            <p className="mt-1.5 text-[15px] text-white/50">
              Your command center — launch any AI service below.
              {email ? <span className="ml-1 text-white/35">· {email}</span> : null}
            </p>
          </div>
          <div className="flex gap-2.5">
            <Stat value={String(services.length)} label="Services" />
            <Stat value={loading ? '·' : String(liveCount)} label="Live now" accent />
          </div>
        </div>

        {!authed && supabaseConfigured() ? null : !supabaseConfigured() ? (
          <div className="mt-6 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-200">
            Demo mode — add your Supabase keys to enable real accounts. You’re viewing tenant <code className="text-amber-100">{tenant}</code>.
          </div>
        ) : null}

        {/* ── services grid ───────────────────────────────────────── */}
        <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc, i) => {
            const Icon = SERVICE_ICONS[svc.slug] || Sparkles;
            const r = data?.services?.[svc.slug];
            const state: ServiceState = r?.state || (loading ? 'setup' : 'setup');
            const meta = STATE_META[state];
            return (
              <motion.div
                key={svc.slug}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.05, ease: 'easeOut' }}
              >
                <Link
                  href={`/${svc.slug}`}
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 transition duration-300 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.05]"
                  style={{ ['--accent' as any]: svc.accent }}
                >
                  {/* accent glow on hover */}
                  <div
                    className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-40"
                    style={{ background: svc.accent }}
                  />
                  <div className="flex items-start justify-between">
                    <span
                      className="grid h-11 w-11 place-items-center rounded-xl border border-white/10"
                      style={{ background: `${svc.accent}1a`, color: svc.accent }}
                    >
                      <Icon size={20} strokeWidth={2.1} />
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.cls}`}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
                      {loading ? '…' : meta.label}
                    </span>
                  </div>

                  <h3 className="mt-4 font-display text-[1.05rem] font-bold tracking-tight">{svc.serviceLabel}</h3>
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-white/50">{svc.sub}</p>

                  {r && r.missing && r.missing.length > 0 ? (
                    <p className="mt-2 text-[12px] text-white/35">Needs: {r.missing.slice(0, 2).join(', ')}{r.missing.length > 2 ? '…' : ''}</p>
                  ) : null}

                  <div className="mt-auto flex items-center gap-1.5 pt-4 text-[13.5px] font-semibold transition-colors" style={{ color: svc.accent }}>
                    Open
                    <ArrowUpRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-white/30">
          {data?.backendUp === false
            ? 'Live readiness unavailable — showing setup requirements. Start the backend to see real status.'
            : 'Readiness reflects your connected channels in real time.'}
        </p>
      </main>
    </div>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-center">
      <div className={`font-display text-xl font-extrabold ${accent ? 'text-[#25D366]' : 'text-white'}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}
