'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import {
  Sparkles, ArrowUpRight, ArrowRight, Lock, Check, Plus, MousePointerClick,
  MessageCircleHeart, X, Globe, Headset, Activity as ActivityIcon, ShieldCheck,
  BookOpen, Clapperboard, TrendingUp, type LucideIcon,
} from 'lucide-react';
import { supabaseConfigured } from '@/lib/supabase/client';
import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import { AddAgentModal } from '@/components/agents/AddAgentModal';
import { getAgentBySlug, getAgentByBackendKey } from '@/lib/agents';
import type { FeedAgent } from '@/lib/pixie-lab/feed';

/**
 * DashboardView — the Pixie Lab home tab, rendered inside PixieLabShell. Fully
 * theme-aware via the --pl-* tokens (default light / soft mint, dark optional).
 * Agent cards lead with the Pixie role avatars and carry an always-on per-agent
 * accent glow (kept subtle in light mode). A skippable "Get started" guide gives
 * first-time owners clear directions. All entitlement/activation logic is live.
 */

interface AgentDef {
  key: FeedAgent;
  name: string;
  avatar: string;
  accent: string;
  tagline: string;
  cta: string;
  badge: string;
  recommend: string;
}

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
  // The demo banner depends on client-only env detection; gate it behind mount
  // so SSR and the first client render always agree (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const raw = params.get('agent') || intendedAgent || '';
  const spotlight = (getAgentBySlug(raw)?.backendKey
    ?? (AGENTS.some((a) => a.key === raw) ? raw : '')) as FeedAgent | '';

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
    <div className="relative min-h-screen text-[var(--pl-text)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[380px]"
        style={{ background: 'radial-gradient(70% 100% at 50% 0%, rgba(var(--pl-green-rgb), calc(var(--pl-glow) * 0.9)), transparent 62%)' }}
      />

      <main className="relative mx-auto w-full px-[clamp(20px,4vw,52px)] py-9">
        {/* greeting */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">Your workspace</p>
          <h1 className="mt-2 font-display text-[clamp(1.9rem,3.4vw,2.5rem)] font-extrabold leading-[1.08] tracking-tight">
            Welcome back,{' '}
            <span className="bg-gradient-to-r from-[var(--pl-green)] to-[#0EA5A3] bg-clip-text text-transparent">{name || 'there'}</span> 👋
          </h1>
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-[var(--pl-text-muted)]">
            Pick an agent to put on the job — each one automates a slice of your daily work.
            {email ? <span className="ml-1 opacity-70">· {email}</span> : null}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <HeaderAction primary icon={Globe} label="New Website" onClick={() => router.push(getAgentByBackendKey('website')?.dashboardPath ?? '/pixie-lab/agents/website')} />
            <HeaderAction icon={Headset} label="Open Receptionist" onClick={() => router.push(getAgentByBackendKey('receptionist')?.dashboardPath ?? '/pixie-lab/agents/receptionist')} />
            <HeaderAction icon={ActivityIcon} label="View Activity" onClick={() => router.push('/pixie-lab/activity')} />
          </div>
        </motion.div>

        {mounted && !authed && !supabaseConfigured() && (
          <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] font-medium text-amber-600 dark:text-amber-200">
            Demo mode — add your Supabase keys to enable real accounts.
          </div>
        )}

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* left column */}
          <div className="min-w-0">
            <GetStartedGuide reduce={reduce} ownedCount={owned.length} />

            <QuickActions />

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
                      onClick={() => router.push(getAgentByBackendKey(a.key)?.dashboardPath ?? '/pixie-lab/dashboard')} />
                  ))}
                </Grid>
              )}
            </Section>

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
          </div>

          {/* right insight panel — desktop only, fills the horizontal space */}
          <aside className="sticky top-[76px] hidden xl:block">
            <InsightPanel tenant={tenant} ownedCount={owned.length} total={AGENTS.length} />
          </aside>
        </div>
      </main>

      <AddAgentModal
        agent={modalAgent?.key ?? null}
        name={modalAgent?.name ?? ''}
        blurb={modalAgent?.recommend ?? ''}
        accent={modalAgent?.accent ?? '#22C55E'}
        onAdd={async (key) => { await activate(key); }}
        onClose={() => setModalAgent(null)}
      />
    </div>
  );
}

const GUIDE_KEY = 'pixie_dash_guide_dismissed';
const STEPS: { icon: typeof Plus; title: string; body: string }[] = [
  { icon: MousePointerClick, title: 'Pick an agent', body: 'Choose the job you want handled first — receptionist, website, SEO, marketing or content.' },
  { icon: Plus, title: 'Switch it on', body: 'Adding an agent is free. It lands in “Your agents” ready to set up.' },
  { icon: MessageCircleHeart, title: 'Let Pixie run it', body: 'Connect WhatsApp or your site and Pixie handles replies, bookings and follow-ups.' },
];

function GetStartedGuide({ reduce, ownedCount }: { reduce: boolean | null; ownedCount: number }) {
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
      className="relative mt-8 overflow-hidden rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 shadow-[var(--pl-shadow-sm)] sm:p-7"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full" style={{ background: 'radial-gradient(circle, rgba(var(--pl-green-rgb),0.18), transparent 65%)' }} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[1.15rem] font-extrabold tracking-tight">
            {ownedCount === 0 ? 'Get started in 3 steps' : 'How Pixie works'}
          </h2>
          <p className="mt-1 text-[13.5px] text-[var(--pl-text-muted)]">A quick tour — you can skip it anytime.</p>
        </div>
        <button
          onClick={dismiss}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]"
        >
          Skip <X size={13} />
        </button>
      </div>

      <ol className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="group rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--pl-green)_35%,var(--pl-border))]">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#22C55E] to-[#0EA5A3] text-white">
                  <Icon size={17} strokeWidth={2.4} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Step {i + 1}</span>
              </div>
              <h3 className="mt-3 font-display text-[15px] font-bold tracking-tight">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--pl-text-muted)]">{s.body}</p>
            </li>
          );
        })}
      </ol>
    </motion.section>
  );
}

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-[color-mix(in_srgb,var(--pl-green)_35%,var(--pl-border))] bg-[var(--pl-surface-soft)] px-6 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#0EA5A3] text-white shadow-[0_12px_30px_-12px_rgba(34,197,94,0.7)]">
        <Sparkles size={24} strokeWidth={2.2} />
      </span>
      <h3 className="mt-4 font-display text-[1.05rem] font-bold tracking-tight">No agents switched on yet</h3>
      <p className="mt-1 max-w-sm text-[13.5px] text-[var(--pl-text-muted)]">Add your first agent below — it&apos;s free — and it&apos;ll show up right here, ready to set up.</p>
      <button
        onClick={onBrowse}
        className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_30px_-12px_rgba(34,197,94,0.8)] transition hover:brightness-110"
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
        <h2 className="font-display text-xl font-extrabold tracking-tight">{title}</h2>
        {count && <span className="rounded-full border border-[color-mix(in_srgb,var(--pl-green)_30%,var(--pl-border))] bg-[var(--pl-green-soft)] px-2.5 py-0.5 text-[12px] font-bold text-[var(--pl-green-dark)]">{count}</span>}
      </div>
      <p className="mt-1 max-w-2xl text-[13.5px] text-[var(--pl-text-muted)]">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))' }}>{children}</div>;
}

function HeaderAction({ icon: Icon, label, onClick, primary }: { icon: LucideIcon; label: string; onClick: () => void; primary?: boolean }) {
  if (primary) {
    return (
      <button onClick={onClick} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_10px_26px_-12px_rgba(34,197,94,0.8)] transition hover:brightness-110">
        <Icon size={15} /> {label}
      </button>
    );
  }
  return (
    <button onClick={onClick} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:border-[var(--pl-border-strong)] hover:text-[var(--pl-text)]">
      <Icon size={15} className="text-[var(--pl-text-muted)]" /> {label}
    </button>
  );
}

const QUICK_ACTIONS: { icon: LucideIcon; label: string; href: string; accent: string }[] = [
  { icon: Globe, label: 'Create a website', href: '/pixie-lab/agents/website', accent: '#3B82F6' },
  { icon: ShieldCheck, label: 'Review approvals', href: '/pixie-lab/approvals', accent: '#22C55E' },
  { icon: BookOpen, label: 'Add business knowledge', href: '/quick-setup', accent: '#14B8A6' },
  { icon: Clapperboard, label: 'Generate content', href: '/pixie-lab/agents/content', accent: '#D4AF37' },
  { icon: ActivityIcon, label: 'Check activity', href: '/pixie-lab/activity', accent: '#EC4899' },
];

function QuickActions() {
  return (
    <section className="mt-9">
      <h2 className="font-display text-xl font-extrabold tracking-tight">Quick actions</h2>
      <p className="mt-1 text-[13.5px] text-[var(--pl-text-muted)]">Jump straight into the things you do most.</p>
      <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {QUICK_ACTIONS.map((q) => {
          const Icon = q.icon;
          return (
            <Link
              key={q.label}
              href={q.href}
              className="group flex items-center gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3.5 shadow-[var(--pl-shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--pl-shadow)]"
              style={{ ['--qa' as string]: q.accent }}
            >
              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl border border-[var(--pl-border)]" style={{ background: `color-mix(in srgb, ${q.accent} 14%, var(--pl-surface))`, color: q.accent }}>
                <Icon size={17} strokeWidth={2.1} />
              </span>
              <span className="text-[13.5px] font-semibold text-[var(--pl-text)]">{q.label}</span>
              <ArrowRight size={15} className="ml-auto text-[var(--pl-text-muted)] transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

interface ActivityEvent { id: string; title: string; type: string; created_at: string }

/** InsightPanel — desktop-only right rail: workspace health, quick stats and a
 *  recent-activity peek. Health/stats are derived from live entitlements;
 *  recent activity is a best-effort fetch (empty state if none/unavailable). */
function InsightPanel({ tenant, ownedCount, total }: { tenant: string; ownedCount: number; total: number }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/lab/activity?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive && Array.isArray(d.events)) setEvents(d.events.slice(0, 4)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [tenant]);

  const health = Math.round((ownedCount / Math.max(1, total)) * 100);
  const stats = [
    { label: 'Agents active', value: `${ownedCount}/${total}`, icon: Sparkles },
    { label: 'Pending approvals', value: '0', icon: ShieldCheck },
    { label: 'Setup complete', value: `${health}%`, icon: TrendingUp },
  ];

  return (
    <div className="space-y-4">
      {/* Workspace health */}
      <div className="rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 shadow-[var(--pl-shadow-sm)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-muted)]">Workspace health</p>
        <div className="mt-3 flex items-end gap-2">
          <span className="font-display text-3xl font-extrabold text-[var(--pl-green)]">{health}%</span>
          <span className="pb-1 text-[12px] text-[var(--pl-text-muted)]">ready</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--pl-surface-soft)]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] transition-[width] duration-500" style={{ width: `${Math.max(6, health)}%` }} />
        </div>
        <div className="mt-4 space-y-2.5">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--pl-surface-soft)] text-[var(--pl-green)]"><Icon size={14} /></span>
                <span className="text-[13px] text-[var(--pl-text-muted)]">{s.label}</span>
                <span className="ml-auto text-[13px] font-bold text-[var(--pl-text)]">{s.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 shadow-[var(--pl-shadow-sm)]">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-muted)]">Recent activity</p>
          <Link href="/pixie-lab/activity" className="text-[12px] font-semibold text-[var(--pl-green)]">View all</Link>
        </div>
        {events.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--pl-text-muted)]">Nothing yet — actions you and Pixie take will show up here.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[var(--pl-green)]" />
                <span className="text-[13px] leading-snug text-[var(--pl-text-soft)]">{e.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
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
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl border bg-[var(--pl-surface)] p-5 text-left shadow-[var(--pl-shadow-sm)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--pl-shadow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        borderColor: spotlight ? `color-mix(in srgb, ${accent} 55%, var(--pl-border))` : 'var(--pl-border)',
        outlineColor: accent,
      }}
    >
      {/* PERSISTENT accent glow — subtle in light, richer in dark (var(--pl-glow)) */}
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: accent, opacity: 'var(--pl-glow)' }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{ background: `linear-gradient(to top, color-mix(in srgb, ${accent} 9%, transparent), transparent)` }}
      />

      <div className="relative flex items-start justify-between">
        <span
          className="grid h-16 w-16 place-items-center rounded-2xl border border-[var(--pl-border)] transition-transform duration-300 group-hover:scale-105"
          style={{ background: `color-mix(in srgb, ${accent} 12%, var(--pl-surface))` }}
        >
          <Image src={def.avatar} alt="" width={44} height={44} className="h-11 w-11 object-contain drop-shadow" loading="lazy" />
        </span>
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}>
            {def.badge}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--pl-green)_30%,var(--pl-border))] bg-[var(--pl-green-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--pl-green-dark)]">
            <Check size={11} /> {statusLabel}
          </span>
        )}
      </div>

      <h3 className="relative mt-4 font-display text-[1.1rem] font-extrabold tracking-tight">{def.name}</h3>
      <p className="relative mt-1 text-[13.5px] leading-relaxed text-[var(--pl-text-muted)]">{locked ? def.recommend : def.tagline}</p>

      <div className="relative mt-auto flex items-center gap-1.5 pt-5 text-[13.5px] font-bold" style={{ color: accent }}>
        {locked
          ? <><Lock size={14} /> {def.key === 'marketing' ? 'Add Marketing Agent' : `Add ${def.name}`}</>
          : <>{def.cta} <ArrowUpRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></>}
      </div>
    </motion.button>
  );
}
