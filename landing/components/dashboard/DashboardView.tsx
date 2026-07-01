'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Sparkles, ArrowUpRight, Lock, Check, Plus, MousePointerClick,
  MessageCircleHeart, X,
} from 'lucide-react';
import { supabaseConfigured } from '@/lib/supabase/client';
import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import { AddAgentModal } from '@/components/agents/AddAgentModal';
import { getAgentBySlug, getAgentByBackendKey } from '@/lib/agents';
import type { FeedAgent } from '@/lib/pixie-lab/feed';

/**
 * DashboardView — the Pixie Lab home tab. Renders as content inside
 * PixieLabShell (the shell owns the rail + topbar), so this is just the <main>.
 * Design language matches For You / Activity: dark #02070a, green→cyan accents,
 * Plus Jakarta Sans display type. Agent cards carry an always-on per-agent
 * accent glow (not hover-only) and lead with the Pixie role avatars. A skippable
 * "Get started" guide gives first-time owners clear directions. All entitlement /
 * activation logic is live (Supabase + the entitlements engine).
 */

interface AgentDef {
  key: FeedAgent;
  name: string;
  avatar: string;   // /images/pixie/forms/*.webp — the role mascot
  accent: string;   // per-agent accent (shared with the shell rail)
  tagline: string;  // when owned
  cta: string;      // when owned
  badge: string;    // when recommended
  recommend: string; // recommended copy
}

// Accents match PixieLabShell's AGENT_ACCENT so the whole Lab stays cohesive.
const AGENTS: AgentDef[] = [
  { key: 'receptionist', name: 'AI Receptionist', avatar: '/images/pixie/forms/receptionist.webp', accent: '#E6B45A',
    tagline: 'Handle calls, customer questions, bookings, and lead follow-ups from one place.',
    cta: 'Open Receptionist', badge: 'Never miss a lead',
    recommend: 'Answer customers and capture every lead across chat, WhatsApp, and SMS — 24/7.' },
  { key: 'website', name: 'Website Builder', avatar: '/images/pixie/forms/website.webp', accent: '#3B82F6',
    tagline: 'Build and edit your business website with one message.',
    cta: 'Start Website Builder', badge: 'Launch faster',
    recommend: 'Build a professional website from a simple conversation and keep editing it with Pixie.' },
  { key: 'seo', name: 'SEO Growth Agent', avatar: '/images/pixie/forms/seo.webp', accent: '#14B8A6',
    tagline: 'Find what is stopping your website from ranking and get clear fixes.',
    cta: 'Explore SEO Agent', badge: 'Boost your website',
    recommend: 'Find what is holding your website back and get clear steps Pixie can help you apply.' },
  { key: 'marketing', name: 'Marketing Agent', avatar: '/images/pixie/forms/social.webp', accent: '#EC4899',
    tagline: 'Turn your offers, updates, and customer stories into campaigns that bring people back.',
    cta: 'Open Marketing', badge: 'Recommended',
    recommend: 'Bring customers back with campaigns Pixie can plan, write, and organize for your business.' },
  { key: 'content', name: 'AI Content Creator', avatar: '/images/pixie/forms/influencer.webp', accent: '#D4AF37',
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
  const [modalAgent, setModalAgent] = useState<AgentDef | null>(null);
  const activatedRef = useRef(false);

  // The intended agent arrives as a canonical slug (intended_agent / ?agent);
  // resolve it to a backend key through the registry so activation can never miss.
  const raw = params.get('agent') || intendedAgent || '';
  const spotlight = (getAgentBySlug(raw)?.backendKey
    ?? (AGENTS.some((a) => a.key === raw) ? raw : '')) as FeedAgent | '';

  // Activate the agent the user came in for (signup / CTA), once, free.
  useEffect(() => {
    if (activatedRef.current || !spotlight) return;
    if (!AGENTS.some((a) => a.key === spotlight)) return;
    if (stateOf(spotlight) === 'locked') {
      activatedRef.current = true;
      activate(spotlight);
    }
  }, [spotlight, stateOf, activate]);

  const owned = useMemo(() => AGENTS.filter((a) => stateOf(a.key) !== 'locked'), [entitlements]);
  const recommended = useMemo(() => AGENTS.filter((a) => stateOf(a.key) === 'locked'), [entitlements]);

  return (
    <div className="relative min-h-screen bg-[#0C1512] text-white">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[460px]"
        style={{ background: 'radial-gradient(80% 100% at 50% 0%, rgba(37,211,102,0.10), transparent 62%)' }}
      />

      <main className="relative mx-auto max-w-6xl px-5 py-10 sm:px-8">
        {/* greeting — matches For You's header rhythm */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">Your workspace</p>
          <h1 className="mt-2 font-display text-[2.1rem] font-extrabold leading-tight tracking-tight">
            Welcome back,{' '}
            <span className="bg-gradient-to-r from-[#25D366] to-[#7dd3fc] bg-clip-text text-transparent">{name || 'there'}</span> 👋
          </h1>
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-white/50">
            Pick an agent to put on the job — each one automates a slice of your daily work.
            {email ? <span className="ml-1 text-white/30">· {email}</span> : null}
          </p>
        </motion.div>

        {!authed && !supabaseConfigured() && (
          <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-200">
            Demo mode — add your Supabase keys to enable real accounts.
          </div>
        )}

        {/* easy directions */}
        <GetStartedGuide reduce={reduce} ownedCount={owned.length} />

        {/* Your agents */}
        <Section
          title="Your agents"
          subtitle="Agents switched on for your workspace — tap one to start working."
          count={owned.length ? `${owned.length} active` : undefined}
        >
          {owned.length === 0 ? (
            <EmptyState onBrowse={() => document.getElementById('recommended')?.scrollIntoView({ behavior: 'smooth' })} />
          ) : (
            <Grid>
              {owned.map((a, i) => (
                <AgentCard key={a.key} def={a} state={stateOf(a.key)} spotlight={spotlight === a.key} index={i} reduce={reduce}
                  onClick={() => router.push(getAgentByBackendKey(a.key)?.dashboardPath ?? '/app/dashboard')} />
              ))}
            </Grid>
          )}
        </Section>

        {/* Recommended */}
        {recommended.length > 0 && (
          <Section
            id="recommended"
            title="Recommended ways to grow"
            subtitle="Add more Pixie agents to handle marketing, content, SEO, and website growth — all free to switch on."
          >
            <Grid>
              {recommended.map((a, i) => (
                <AgentCard key={a.key} def={a} state="locked" index={i} reduce={reduce} onClick={() => setModalAgent(a)} />
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

/* ─────────────────────────────────────────────────────────────────────────
   Easy directions — a skippable 3-step guide (ux-guidelines: give Skip, never
   force a linear tour). Dismissal persists so it never nags a returning user. */
const GUIDE_KEY = 'pixie_dash_guide_dismissed';
const STEPS: { icon: typeof Plus; title: string; body: string }[] = [
  { icon: MousePointerClick, title: 'Pick an agent', body: 'Choose the job you want handled first — receptionist, website, SEO, marketing or content.' },
  { icon: Plus, title: 'Switch it on', body: 'Adding an agent is free. It lands in “Your agents” ready to set up.' },
  { icon: MessageCircleHeart, title: 'Let Pixie run it', body: 'Connect WhatsApp or your site and Pixie handles replies, bookings and follow-ups.' },
];

function GetStartedGuide({ reduce, ownedCount }: { reduce: boolean | null; ownedCount: number }) {
  // Start hidden to avoid an SSR/client flash; reveal after reading localStorage.
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(GUIDE_KEY) !== '1') setShow(true); } catch { setShow(true); }
  }, []);
  function dismiss() {
    setShow(false);
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* ignore */ }
  }
  if (!show) return null;

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative mt-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-7"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.16),transparent_65%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[1.15rem] font-extrabold tracking-tight">
            {ownedCount === 0 ? 'Get started in 3 steps' : 'How Pixie works'}
          </h2>
          <p className="mt-1 text-[13.5px] text-white/45">A quick tour — you can skip it anytime.</p>
        </div>
        <button
          onClick={dismiss}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12.5px] font-semibold text-white/55 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
        >
          Skip <X size={13} />
        </button>
      </div>

      <ol className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-[#25D366]/25 hover:bg-white/[0.04]">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[#25D366] to-[#22d3ee] text-[#02070a]">
                  <Icon size={17} strokeWidth={2.4} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/35">Step {i + 1}</span>
              </div>
              <h3 className="mt-3 font-display text-[15px] font-bold tracking-tight">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-white/50">{s.body}</p>
            </li>
          );
        })}
      </ol>
    </motion.section>
  );
}

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#25D366]/25 bg-white/[0.02] px-6 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#25D366] to-[#22d3ee] text-[#02070a] shadow-[0_12px_30px_-12px_rgba(37,211,102,0.7)]">
        <Sparkles size={24} strokeWidth={2.2} />
      </span>
      <h3 className="mt-4 font-display text-[1.05rem] font-bold tracking-tight">No agents switched on yet</h3>
      <p className="mt-1 max-w-sm text-[13.5px] text-white/50">Add your first agent below — it&apos;s free — and it&apos;ll show up right here, ready to set up.</p>
      <button
        onClick={onBrowse}
        className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#25D366] to-[#22d3ee] px-4 py-2.5 text-sm font-bold text-[#02070a] shadow-[0_12px_30px_-12px_rgba(37,211,102,0.8)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
      >
        Browse agents <ArrowUpRight size={16} />
      </button>
    </div>
  );
}

function Section({ id, title, subtitle, count, children }: { id?: string; title: string; subtitle: string; count?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-11 scroll-mt-24">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-lg font-extrabold tracking-tight">{title}</h2>
        {count && <span className="rounded-full border border-[#25D366]/25 bg-[#25D366]/12 px-2.5 py-0.5 text-[12px] font-bold text-[#7ef0a8]">{count}</span>}
      </div>
      <p className="mt-1 max-w-2xl text-[13.5px] text-white/45">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function AgentCard({ def, state, spotlight, index, reduce, onClick }: {
  def: AgentDef; state: string; spotlight?: boolean; index: number; reduce: boolean | null; onClick: () => void;
}) {
  const locked = state === 'locked';
  const statusLabel = state === 'active' ? 'Active' : state === 'trial' ? 'Trial' : 'Available';
  const { accent } = def;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : index * 0.05, ease: 'easeOut' }}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white/[0.03] p-5 text-left transition-all duration-300 hover:-translate-y-1.5 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        borderColor: spotlight ? `${accent}80` : `${accent}33`,
        outlineColor: accent,
      }}
    >
      {/* PERSISTENT accent glow — always visible, intensifies on hover */}
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
        style={{ background: accent }}
      />
      {/* persistent faint accent wash grounding the card */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{ background: `linear-gradient(to top, ${accent}14, transparent)` }}
      />

      <div className="relative flex items-start justify-between">
        {/* the role avatar — leads the card instead of a generic icon */}
        <span
          className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 transition-transform duration-300 group-hover:scale-105"
          style={{ background: `${accent}1f` }}
        >
          <Image
            src={def.avatar}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 object-contain drop-shadow"
            loading="lazy"
          />
        </span>
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${accent}1f`, color: accent }}>
            {def.badge}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/30 bg-[#25D366]/12 px-2.5 py-1 text-[11px] font-bold text-[#7ef0a8]">
            <Check size={11} /> {statusLabel}
          </span>
        )}
      </div>

      <h3 className="relative mt-4 font-display text-[1.1rem] font-extrabold tracking-tight">{def.name}</h3>
      <p className="relative mt-1 text-[13.5px] leading-relaxed text-white/55">{locked ? def.recommend : def.tagline}</p>

      <div className="relative mt-auto flex items-center gap-1.5 pt-5 text-[13.5px] font-bold" style={{ color: accent }}>
        {locked
          ? <><Lock size={14} /> {def.key === 'marketing' ? 'Add Marketing Agent' : `Add ${def.name}`}</>
          : <>{def.cta} <ArrowUpRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></>}
      </div>
    </motion.button>
  );
}
