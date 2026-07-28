'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Star, FileText, CheckCircle2, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoLocalOverview } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';

const ACCENT = '#14B8A6';

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
  tone,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  href?: string;
  tone?: string;
}) {
  const inner = (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-center gap-1.5">
        <Icon size={13} style={{ color: tone ?? ACCENT }} />
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">{label}</span>
        {href && <ArrowUpRight size={12} className="ml-auto" style={{ color: ACCENT }} />}
      </div>
      <p className="font-display text-[22px] font-extrabold text-[var(--pl-text)]">
        {value == null ? <span className="text-[var(--pl-text-muted)]">—</span> : value}
      </p>
      {sub && <p className="text-[11.5px] text-[var(--pl-text-muted)]">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function SeoLocalPanel() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [overview, setOverview] = useState<SeoLocalOverview | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const env = await seoApi.localOverview();
      if (!alive) return;
      if (!env.backendUp) { setStatus('offline'); return; }
      setOverview(env.overview ?? null);
      setStatus('done');
    }
    load();
    return () => { alive = false; };
  }, []);

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-20" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={() => setStatus('loading')} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  if (!overview || (!overview.location_count && !overview.total_reviews && !overview.citation_count)) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No local SEO data yet"
          body="Add your business locations to start tracking reviews, citations, and local rankings."
          action={
            <Link href={seoRoutes.locations()} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
              <MapPin size={14} /> Add Location
            </Link>
          }
        />
      </div>
    );
  }

  const ov = overview;

  return (
    <div className="mt-6 space-y-5">
      {/* Metrics grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          icon={MapPin}
          label="Locations"
          value={ov.location_count ?? 0}
          href={seoRoutes.locations()}
        />
        <MetricCard
          icon={Star}
          label="Avg Rating"
          value={ov.avg_rating != null ? ov.avg_rating.toFixed(1) : null}
          sub={ov.total_reviews != null ? `${ov.total_reviews} total reviews` : undefined}
          href={seoRoutes.reviews()}
          tone="#f59e0b"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Unanswered Reviews"
          value={ov.unanswered_reviews ?? 0}
          href={seoRoutes.reviews()}
          tone={ov.unanswered_reviews ? '#ef4444' : ACCENT}
        />
        <MetricCard
          icon={FileText}
          label="Citations"
          value={ov.citation_count ?? 0}
          href={seoRoutes.citations()}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Inconsistent Citations"
          value={ov.inconsistent_citations ?? 0}
          href={seoRoutes.citations()}
          tone={ov.inconsistent_citations ? '#f59e0b' : '#22c55e'}
        />
        {ov.local_rank_avg != null && (
          <MetricCard
            icon={MapPin}
            label="Avg Local Rank"
            value={`#${Math.round(ov.local_rank_avg)}`}
          />
        )}
      </div>

      {/* Quick navigation */}
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Quick Navigation</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { label: 'Manage Locations', href: seoRoutes.locations(), icon: MapPin },
            { label: 'Respond to Reviews', href: seoRoutes.reviews(), icon: Star },
            { label: 'Check Citations', href: seoRoutes.citations(), icon: FileText },
          ].map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-xl border border-[var(--pl-border)] px-4 py-3 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:border-[var(--pl-border-strong)] hover:text-[var(--pl-text)]"
            >
              <Icon size={14} style={{ color: ACCENT }} />
              {label}
              <ArrowUpRight size={12} className="ml-auto" style={{ color: ACCENT }} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
