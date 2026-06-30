'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Headset, Globe, Search, Megaphone, Clapperboard, Sparkles, ArrowUpRight,
  LogOut, Lock, Check, type LucideIcon,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import { AddAgentModal } from '@/components/agents/AddAgentModal';
import type { FeedAgent } from '@/lib/pixie-lab/feed';

/**
 * DashboardView — the post-login home. Spotify-style agent cards split into
 * "Your agents" (active/trial) and "Recommended ways to grow" (locked, no
 * payment). Activates the agent the user signed up for (?agent / intended_agent)
 * on arrival, and lets them add more agents free via AddAgentModal. Auth +
 * entitlement state are live (Supabase + the entitlements engine).
 */

interface AgentDef {
  key: FeedAgent;
  name: string;
  icon: LucideIcon;
  accent: string;
  tagline: string;
  cta: string; // when owned
  badge: string; // when recommended
  recommend: string; // recommended copy
}

const AGENTS: AgentDef[] = [
  { key: 'receptionist', name: 'AI Receptionist', icon: Headset, accent: '#E6B45A',
    tagline: 'Handle calls, customer questions, bookings, and lead follow-ups from one place.',
    cta: 'Open Receptionist', badge: 'Never miss a lead',
    recommend: 'Answer customers and capture every lead across chat, WhatsApp, and SMS — 24/7.' },
  { key: 'website', name: 'Website Builder', icon: Globe, accent: '#3B82F6',
    tagline: 'Build and edit your business website with one message.',
    cta: 'Start Website Builder', badge: 'Launch faster',
    recommend: 'Build a professional website from a simple conversation and keep editing it with Pixie.' },
  { key: 'seo', name: 'SEO Growth Agent', icon: Search, accent: '#14B8A6',
    tagline: 'Find what is stopping your website from ranking and get clear fixes.',
    cta: 'Explore SEO Agent', badge: 'Boost your website',
    recommend: 'Find what is holding your website back and get clear steps Pixie can help you apply.' },
  { key: 'marketing', name: 'Marketing Agent', icon: Megaphone, accent: '#EC4899',
    tagline: 'Turn your offers, updates, and customer stories into campaigns that bring people back.',
    cta: 'Open Marketing', badge: 'Recommended',
    recommend: 'Bring customers back with campaigns Pixie can plan, write, and organize for your business.' },
  { key: 'content', name: 'AI Content Creator', icon: Clapperboard, accent: '#D4AF37',
    tagline: 'Generate posts, reels, captions, and campaign ideas based on your business in minutes.',
    cta: 'Create Content', badge: 'Content engine',
    recommend: 'Turn your services, offers, and updates into ready-to-post content ideas in minutes.' },
];

export function DashboardView({
  tenant,
  name,
  email,
  authed,
  intendedAgent,
}: {
  tenant: string;
  name: string;
  email: string;
  authed: boolean;
  intendedAgent?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const { entitlements, stateOf, activate } = useEntitlements(tenant);
  const [signingOut, setSigningOut] = useState(false);
  const [modalAgent, setModalAgent] = useState<AgentDef | null>(null);
  const activatedRef = useRef(false);

  const spotlight = (params.get('agent') || intendedAgent || '') as FeedAgent | '';

  // Activate the agent the user came in for (signup / CTA), once, free.
  useEffect(() => {
    if (activatedRef.current || !spotlight) return;
    if (!AGENTS.some((a) => a.key === spotlight)) return;
    if (stateOf(spotlight) === 'locked') {
      activatedRef.current = true;
      activate(spotlight);
    }
  }, [spotlight, stateOf, activate]);

  async function signOut() {
    setSigningOut(true);
    try { if (supabaseConfigured()) await createClient().auth.signOut(); } catch { /* ignore */ }
    router.replace('/login');
    router.refresh();
  }

  const owned = useMemo(() => AGENTS.filter((a) => stateOf(a.key) !== 'locked'), [entitlements]);
  const recommended = useMemo(() => AGENTS.filter((a) => stateOf(a.key) === 'locked'), [entitlements]);
  const initial = (name || 'P').charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen bg-[#02070a] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px]" style={{ background: 'radial-gradient(80% 100% at 50% 0%, rgba(37,211,102,0.12), transparent 60%)' }} />

      {/* capsule header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#02070a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2.5 font-display text-base font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#25D366] to-[#22d3ee] text-[#02070a]"><Sparkles size={16} strokeWidth={2.5} /></span>
            Pixie
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-white/55 md:flex">
            <span className="text-white">Dashboard</span>
            <Link href="/pixie-lab/for-you" className="hover:text-white">For You</Link>
            <Link href="/pixie-lab/activity" className="hover:text-white">Activity</Link>
          </nav>
          <div className="flex items-center gap-2.5">
            <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55 sm:inline">{tenant}</span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#25D366]/80 to-[#22d3ee]/80 text-sm font-bold text-[#02070a]">{initial}</span>
            <button onClick={signOut} disabled={signingOut} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white/70 transition hover:text-white disabled:opacity-60">
              <LogOut size={15} /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {/* welcome */}
        <h1 className="font-display text-[2.1rem] font-extrabold leading-tight tracking-tight">
          Welcome to <span className="bg-gradient-to-r from-[#25D366] to-[#7dd3fc] bg-clip-text text-transparent">Pixie</span>, {name} 👋
        </h1>
        <p className="mt-1.5 text-[15px] text-white/50">
          Your business workspace is ready. Choose an agent below to start automating your daily work.
          {email ? <span className="ml-1 text-white/30">· {email}</span> : null}
        </p>
        {!authed && !supabaseConfigured() && (
          <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-200">
            Demo mode — add your Supabase keys to enable real accounts.
          </div>
        )}

        {/* Your agents */}
        <Section title="Your agents" subtitle="Agents enabled for your workspace.">
          {owned.length === 0 ? (
            <p className="text-sm text-white/45">No agents yet — add one from the recommendations below.</p>
          ) : (
            <Grid>
              {owned.map((a, i) => (
                <SpotifyCard key={a.key} def={a} state={stateOf(a.key)} spotlight={spotlight === a.key} index={i} reduce={reduce}
                  onClick={() => router.push(`/pixie-lab/agents/${a.key}`)} />
              ))}
            </Grid>
          )}
        </Section>

        {/* Recommended */}
        {recommended.length > 0 && (
          <Section title="Recommended ways to grow" subtitle="Add more Pixie agents to handle marketing, content, SEO, and website growth from the same dashboard.">
            <Grid>
              {recommended.map((a, i) => (
                <SpotifyCard key={a.key} def={a} state="locked" index={i} reduce={reduce} onClick={() => setModalAgent(a)} />
              ))}
            </Grid>
          </Section>
        )}
      </main>

      <AddAgentModal
        agent={modalAgent?.key ?? null}
        name={modalAgent?.name ?? ''}
        blurb={modalAgent?.recommend ?? ''}
        accent={modalAgent?.accent ?? '#25D366'}
        onAdd={async (key) => { await activate(key); }}
        onClose={() => setModalAgent(null)}
      />
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-extrabold tracking-tight">{title}</h2>
      <p className="mt-1 max-w-2xl text-[13.5px] text-white/45">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function SpotifyCard({ def, state, spotlight, index, reduce, onClick }: {
  def: AgentDef; state: string; spotlight?: boolean; index: number; reduce: boolean | null; onClick: () => void;
}) {
  const Icon = def.icon;
  const locked = state === 'locked';
  const statusLabel = state === 'active' ? 'Active' : state === 'trial' ? 'Trial' : 'Available';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : index * 0.05, ease: 'easeOut' }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white/[0.03] p-5 text-left transition duration-300 hover:-translate-y-1 hover:bg-white/[0.05]"
      style={{ borderColor: spotlight ? `${def.accent}66` : 'rgba(255,255,255,0.08)', ['--accent' as string]: def.accent }}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-30" style={{ background: def.accent }} />

      <div className="flex items-start justify-between">
        <span className="grid h-12 w-12 place-items-center rounded-xl border border-white/10" style={{ background: `${def.accent}1a`, color: def.accent }}>
          <Icon size={22} strokeWidth={2.1} />
        </span>
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: `${def.accent}1f`, color: def.accent }}>
            {def.badge}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-1 text-[11px] font-semibold text-[#7ef0a8]">
            <Check size={11} /> {statusLabel}
          </span>
        )}
      </div>

      <h3 className="mt-4 font-display text-[1.05rem] font-bold tracking-tight">{def.name}</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">{locked ? def.recommend : def.tagline}</p>

      <div className="mt-auto flex items-center gap-1.5 pt-5 text-[13.5px] font-semibold" style={{ color: def.accent }}>
        {locked ? <><Lock size={14} /> {def.key === 'marketing' ? 'Add Marketing Agent' : `Add ${def.name}`}</> : <>{def.cta} <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></>}
      </div>
    </motion.button>
  );
}
