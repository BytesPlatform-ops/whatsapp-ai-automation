'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe, PlayCircle, AlertTriangle, CheckCircle2, Loader2,
  ArrowUpRight, RefreshCw, Plus,
} from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoDurableSite, SeoCrawlJob, SeoCrawlReport, SeoConnectionPlatform } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Ring } from './Ring';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';

const ACCENT = '#14B8A6';
const SEV_COLOR: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6', info: '#64748b' };

function statusColor(s: string) {
  if (s === 'completed') return '#22c55e';
  if (s === 'running') return ACCENT;
  if (s === 'failed') return '#ef4444';
  if (s === 'queued') return '#f59e0b';
  return '#64748b';
}

function statusLabel(s: string) {
  return s === 'running' ? 'Crawling…' : s.charAt(0).toUpperCase() + s.slice(1);
}

interface SiteRow {
  site: SeoDurableSite;
  latestCrawl: SeoCrawlJob | null;
  report: SeoCrawlReport | null;
  issueCount: number;
  criticalCount: number;
}

export function SeoOverviewPanel({ tenant }: { tenant: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [connections, setConnections] = useState<SeoConnectionPlatform[]>([]);

  // Suppress unused tenant warning — passed in for future use (entitlement context).
  void tenant;

  useEffect(() => {
    let alive = true;
    async function load() {
      const sitesEnv = await seoApi.listSites();
      if (!alive) return;
      if (!sitesEnv.backendUp) { setStatus('offline'); return; }

      const sites = sitesEnv.sites ?? [];

      // Also load connections status (non-blocking; ignore errors).
      seoApi.connections().then((c) => {
        if (alive && c.backendUp) setConnections(c.platforms ?? []);
      });

      if (!sites.length) { setRows([]); setStatus('done'); return; }

      // For each site, load latest crawl + report in parallel.
      const rowData = await Promise.all(
        sites.map(async (site): Promise<SiteRow> => {
          // Latest crawl for this site.
          const crawlsEnv = await seoApi.listCrawls(site.id);
          const jobs = crawlsEnv.jobs ?? [];
          const latestCrawl = jobs.length > 0 ? jobs[0] : null;

          // Report + issue counts.
          let report: SeoCrawlReport | null = null;
          let issueCount = 0;
          let criticalCount = 0;

          const reportEnv = await seoApi.getReport({ site_id: site.id });
          if (reportEnv.backendUp && reportEnv.report) {
            report = reportEnv.report;
            const ic = report.issue_counts ?? {};
            issueCount = Object.values(ic).reduce((s, v) => s + (v as number), 0);
            criticalCount = (ic.critical ?? 0) as number;
          }

          return { site, latestCrawl, report, issueCount, criticalCount };
        }),
      );

      if (alive) { setRows(rowData); setStatus('done'); }
    }

    load();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading') {
    return (
      <div className="mt-6 space-y-5">
        <LoadingCards count={3} height="h-28" />
      </div>
    );
  }
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={() => { setStatus('loading'); }} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  const connectedPlatform = connections.find((c) => c.connected);

  if (rows.length === 0) {
    return (
      <div className="mt-6 space-y-5">
        {/* Connection status */}
        <ConnectionStatusBar platforms={connections} />
        <EmptyState
          title="Add your first site"
          body="Register a site to start crawling, track technical issues, and monitor your SEO score over time."
          action={
            <Link href={seoRoutes.sites()} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
              <Plus size={15} /> Add a site
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Connection status */}
      <ConnectionStatusBar platforms={connections} />

      {/* Sites summary grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ site, latestCrawl, report, issueCount, criticalCount }) => (
          <SiteCard
            key={site.id}
            site={site}
            latestCrawl={latestCrawl}
            report={report}
            issueCount={issueCount}
            criticalCount={criticalCount}
          />
        ))}
        {/* Add site card */}
        <Link
          href={seoRoutes.sites()}
          className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface-soft)] text-[var(--pl-text-muted)] transition hover:border-[var(--pl-border-strong)] hover:text-[var(--pl-text)]"
        >
          <Plus size={22} />
          <span className="text-[13px] font-semibold">Add a site</span>
        </Link>
      </div>

      {/* Recommended next actions */}
      <NextActions rows={rows} connectedPlatform={!!connectedPlatform} />
    </div>
  );
}

function SiteCard({ site, latestCrawl, report, issueCount, criticalCount }: SiteRow) {
  const crawlStatus = latestCrawl?.status;
  const score = report?.score ?? null;
  const maxScore = 100;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-[14.5px] font-bold text-[var(--pl-text)]">{site.display_name || site.domain}</p>
          {site.display_name && <p className="truncate text-[12px] text-[var(--pl-text-muted)]">{site.domain}</p>}
        </div>
        {score !== null && <Ring score={score} max={maxScore} size={52} />}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--pl-text-muted)]">
        {latestCrawl ? (
          <span className="inline-flex items-center gap-1" style={{ color: statusColor(latestCrawl.status) }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor(latestCrawl.status) }} />
            {statusLabel(latestCrawl.status)}
            {latestCrawl.status === 'completed' && latestCrawl.crawled_count != null && (
              <> · {latestCrawl.crawled_count} pages</>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[var(--pl-text-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--pl-text-muted)]" />
            No crawl yet
          </span>
        )}
        {issueCount > 0 && (
          <span className="inline-flex items-center gap-1" style={{ color: criticalCount > 0 ? SEV_COLOR.critical : SEV_COLOR.medium }}>
            <AlertTriangle size={11} />
            {criticalCount > 0 ? `${criticalCount} critical` : `${issueCount} issues`}
          </span>
        )}
        {issueCount === 0 && report && (
          <span className="inline-flex items-center gap-1" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={11} /> Clean
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {latestCrawl?.status === 'completed' && (
          <Link
            href={seoRoutes.issues({ site_id: site.id })}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            Issues <ArrowUpRight size={12} style={{ color: ACCENT }} />
          </Link>
        )}
        {(!latestCrawl || latestCrawl.status === 'completed' || latestCrawl.status === 'failed') && (
          <StartCrawlButton siteId={site.id} />
        )}
        {latestCrawl?.status === 'running' && (
          <Link
            href={seoRoutes.crawls({ site_id: site.id })}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            <Loader2 size={12} className="animate-spin" style={{ color: ACCENT }} /> View progress
          </Link>
        )}
        {latestCrawl?.status === 'completed' && report && (
          <Link
            href={seoRoutes.reports({ site_id: site.id })}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            Report <ArrowUpRight size={12} style={{ color: ACCENT }} />
          </Link>
        )}
      </div>
    </div>
  );
}

function StartCrawlButton({ siteId }: { siteId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function start() {
    setBusy(true);
    const r = await seoApi.startCrawl({ site_id: siteId, crawl_type: 'site' });
    setBusy(false);
    if (r.backendUp) setDone(true);
  }

  if (done) {
    return (
      <Link
        href={seoRoutes.crawls({ site_id: siteId })}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold text-[#02120f]"
        style={{ background: ACCENT }}
      >
        <PlayCircle size={12} /> View crawl
      </Link>
    );
  }

  return (
    <button
      onClick={start}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold text-[#02120f] disabled:opacity-60"
      style={{ background: ACCENT }}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
      {busy ? 'Starting…' : 'Start crawl'}
    </button>
  );
}

function ConnectionStatusBar({ platforms }: { platforms: SeoConnectionPlatform[] }) {
  if (!platforms.length) return null;
  const connected = platforms.filter((p) => p.connected);
  const total = platforms.length;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-2.5">
      <Globe size={14} style={{ color: ACCENT }} />
      <span className="text-[13px] text-[var(--pl-text-soft)]">
        {connected.length === 0
          ? 'No platforms connected — fixes will be copy-ready only.'
          : `${connected.length} of ${total} platform${total === 1 ? '' : 's'} connected.`}
      </span>
      <Link href={seoRoutes.connections()} className="ml-auto text-[12px] font-semibold" style={{ color: ACCENT }}>
        {connected.length === 0 ? 'Connect' : 'Manage'}
      </Link>
    </div>
  );
}

function NextActions({ rows, connectedPlatform }: { rows: SiteRow[]; connectedPlatform: boolean }) {
  const actions: { label: string; href: string; priority: 'high' | 'medium' }[] = [];

  const hasCritical = rows.some((r) => r.criticalCount > 0);
  if (hasCritical) {
    actions.push({ label: 'Fix critical issues', href: seoRoutes.issues({ severity: 'critical' }), priority: 'high' });
  }

  const hasNoReport = rows.some((r) => !r.report);
  if (hasNoReport) {
    actions.push({ label: 'Start a crawl to get your SEO score', href: seoRoutes.crawls(), priority: 'medium' });
  }

  if (!connectedPlatform) {
    actions.push({ label: 'Connect a platform for one-tap fixes', href: seoRoutes.connections(), priority: 'medium' });
  }

  if (!actions.length) return null;

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Recommended next</p>
      <ul className="space-y-2">
        {actions.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]"
            >
              <span
                className="h-1.5 w-1.5 flex-none rounded-full"
                style={{ background: a.priority === 'high' ? SEV_COLOR.critical : ACCENT }}
              />
              {a.label}
              <ArrowUpRight size={13} className="ml-auto" style={{ color: ACCENT }} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
