'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import {
  Headset,
  Globe,
  Megaphone,
  Clapperboard,
  Search,
  MessagesSquare,
  ArrowRight,
  CheckCircle2,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { PIXIE_SERVICES, SERVICE_SLUGS, type ServiceConfig } from '@shared/pixieServices';

/**
 * ServicesDashboard — the standalone Pixie "command center": every service Pixie
 * can run, each shown WITH the requirements it needs to start AND its live
 * readiness pulled from the backend channels/agents API.
 *
 * Shares its service data with the marketing site via @shared/pixieServices (the
 * single source of truth) so a service's accent, label, and requirements stay
 * identical across both apps. Themed to match the landing hero (#02070a + accent
 * glow). Readiness is real: backend down → static requirements view (no fake
 * "ready"). Each card links into the marketing service page to begin setup.
 */

// The marketing site (service setup pages) lives at a separate origin in prod.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';

const SERVICE_ICONS: Record<string, LucideIcon> = {
  'ai-receptionist': Headset,
  'website-builder': Globe,
  'social-media-marketing': Megaphone,
  'ai-influencer': Clapperboard,
  'seo-audit': Search,
  'omnichannel-ai': MessagesSquare,
};

const DASHBOARD_ORDER = [
  'ai-receptionist',
  'website-builder',
  'social-media-marketing',
  'ai-influencer',
  'seo-audit',
  'omnichannel-ai',
];

function orderedServices(): ServiceConfig[] {
  const order = DASHBOARD_ORDER.filter((s) => SERVICE_SLUGS.includes(s));
  const extras = SERVICE_SLUGS.filter((s) => !order.includes(s));
  return [...order, ...extras].map((slug) => PIXIE_SERVICES[slug]);
}

// ── readiness types (mirror app/api/services/readiness/route.ts) ──────────────
type ServiceState = 'live' | 'partial' | 'setup' | 'unavailable';
interface ServiceReadiness {
  slug: string;
  channelsTotal: number;
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

function useReadiness(tenant: string) {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/services/readiness?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) setData(j);
      })
      .catch(() => {
        if (alive) setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tenant]);

  return { data, loading };
}

// ── readiness pill (dark) ─────────────────────────────────────────────────────
function ReadinessPill({
  reqCount,
  loading,
  readiness,
}: {
  reqCount: number;
  loading: boolean;
  readiness: ServiceReadiness | undefined;
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider';

  if (!loading && !readiness) {
    return <span className={`${base} border border-white/12 bg-white/[0.04] text-white/55`}>{reqCount} to start</span>;
  }

  if (loading) {
    return (
      <span className={`${base} border border-white/12 bg-white/[0.04] text-white/55`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking
      </span>
    );
  }

  const state = readiness!.state;
  if (state === 'live') {
    return (
      <span className={`${base} border border-emerald-400/25 bg-emerald-400/10 text-emerald-300`}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
          <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        Live
      </span>
    );
  }
  if (state === 'partial') {
    return (
      <span className={`${base} border border-amber-400/25 bg-amber-400/10 text-amber-300`}>
        {readiness!.channelsReady}/{readiness!.channelsTotal} ready
      </span>
    );
  }
  if (state === 'setup') {
    return (
      <span
        className={base}
        style={{
          border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
          background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
          color: 'var(--soft)',
        }}
      >
        Setup needed
      </span>
    );
  }
  return <span className={`${base} border border-white/12 bg-white/[0.04] text-white/55`}>{reqCount} to start</span>;
}

function ServiceCard({
  svc,
  index,
  loading,
  readiness,
}: {
  svc: ServiceConfig;
  index: number;
  loading: boolean;
  readiness: ServiceReadiness | undefined;
}) {
  const reduce = useReducedMotion();
  const Icon = SERVICE_ICONS[svc.slug] ?? Globe;
  const isLive = readiness?.state === 'live';

  const card: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 28 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: reduce ? 0 : index * 0.06 },
    },
  };

  return (
    <motion.article
      variants={card}
      style={{ ['--accent' as string]: svc.accent, ['--soft' as string]: svc.soft }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-white/20"
    >
      <div
        className="relative px-6 pt-6 pb-5"
        style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className="flex h-12 w-12 flex-none items-center justify-center rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
              color: 'var(--soft)',
              boxShadow: '0 8px 24px color-mix(in srgb, var(--accent) 22%, transparent)',
            }}
          >
            <Icon className="h-6 w-6" />
          </span>
          <ReadinessPill reqCount={svc.requirements.length} loading={loading} readiness={readiness} />
        </div>
        <h3 className="mt-4 font-display text-xl font-extrabold tracking-tight text-[#F4FFF9]">{svc.serviceLabel}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-white/55">{svc.sub}</p>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-6">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">What Pixie needs from you</p>
        <ul className="grid gap-2">
          {svc.requirements.map((req, i) => (
            <li key={req} className="flex items-center gap-2.5">
              <span
                className="flex h-5 w-5 flex-none items-center justify-center rounded-md text-[10px] font-bold"
                style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--soft)' }}
              >
                {i + 1}
              </span>
              <span className="text-[13px] font-medium text-white/80">{req}</span>
            </li>
          ))}
        </ul>

        <a
          href={`${SITE_URL}/${svc.slug}`}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold tracking-wide transition-transform active:scale-[0.98]"
          style={{
            background: 'var(--accent)',
            color: 'var(--button-text, #06110c)',
            boxShadow: '0 12px 32px color-mix(in srgb, var(--accent) 30%, transparent)',
          }}
          aria-label={`${isLive ? 'Manage' : 'Start'} ${svc.serviceLabel}`}
        >
          {isLive ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Manage service
            </>
          ) : (
            <>
              Start setup
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </a>
      </div>
    </motion.article>
  );
}

export function ServicesDashboard({ tenant = 'demo' }: { tenant?: string }) {
  const reduce = useReducedMotion();
  const services = orderedServices();
  const { data, loading } = useReadiness(tenant);

  const grid: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.04 } },
  };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#02070a] text-white" style={{ ['--accent' as string]: '#8B7CF6', ['--soft' as string]: '#C4B5FD', ['--button-text' as string]: '#0a0612' }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[520px]"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, color-mix(in srgb, var(--accent) 8%, transparent) 34%, transparent 64%)',
        }}
      />

      <header className="relative z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
          <span className="font-display text-lg font-extrabold tracking-tight text-white">Pixie</span>
          <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
            Dashboard
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-10 md:px-8">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Your Pixie services</p>
          <h1 className="mt-3 font-display text-[clamp(2rem,4.2vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[#F4FFF9]">
            Pick a service. Pixie tells you exactly what it needs.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/65">
            Every Pixie mode is ready to set up — each one lists the few details it needs from you, plus its live status
            once it&apos;s running. No long briefs, no heavy forms.
          </p>
        </div>

        <motion.div
          variants={grid}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {services.map((svc, i) => (
            <ServiceCard key={svc.slug} svc={svc} index={i} loading={loading} readiness={data?.services?.[svc.slug]} />
          ))}
        </motion.div>

        {!loading && data && !data.backendUp && (
          <p className="mt-8 text-center text-xs text-white/40">
            Live status is offline — showing setup requirements. Connect the Pixie backend to see real-time readiness.
          </p>
        )}
      </main>
    </div>
  );
}
