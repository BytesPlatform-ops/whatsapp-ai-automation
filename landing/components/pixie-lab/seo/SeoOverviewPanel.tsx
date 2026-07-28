'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe, PlayCircle, AlertTriangle, CheckCircle2, Loader2,
  ArrowUpRight, RefreshCw, Plus, BarChart2, Zap, Bell,
  Wifi, WifiOff, Hash,
} from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type {
  SeoDurableSite, SeoCrawlJob, SeoCrawlReport, SeoConnectionPlatform,
  SeoOpportunity, SeoAlert, SeoIntegrationStatus, SeoRankOverview,
  SeoKeywordProject,
} from '@/lib/pixie-lab/serviceTypes';
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

// ── Intelligence cards state ───────────────────────────────────────────────

interface IntelState {
  loading: boolean;
  rankOverview: SeoRankOverview | null;
  opportunities: SeoOpportunity[];
  alerts: SeoAlert[];
  integrations: SeoIntegrationStatus[];
  lastUpdated: Date | null;
}

/** A small stat card used throughout the intel row. */
function IntelCard({
  icon: Icon,
  label,
  loading,
  lastUpdated,
  href,
  children,
}: {
  icon: typeof Hash;
  label: string;
  loading: boolean;
  lastUpdated?: Date | null;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-center gap-1.5">
        <Icon size={13} style={{ color: ACCENT }} />
        <span className="text-[11.5px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">{label}</span>
        <Link href={href} className="ml-auto" aria-label={`Open ${label}`}>
          <ArrowUpRight size={13} style={{ color: ACCENT }} />
        </Link>
      </div>
      {loading ? (
        <div className="h-12 animate-pulse rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)]" />
      ) : (
        <div className="flex-1">{children}</div>
      )}
      {lastUpdated && !loading && (
        <p className="text-[10.5px] text-[var(--pl-text-muted)]">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

/** Ranking card — tracked keywords + avg rank + distribution buckets. */
function RankingCard({ loading, overview, lastUpdated }: { loading: boolean; overview: SeoRankOverview | null; lastUpdated: Date | null }) {
  const total = overview?.total_keywords ?? 0;
  const avgRank = overview?.avg_rank;
  const top3 = overview?.top_3 ?? 0;
  const top10 = overview?.top_10 ?? 0;
  const top100 = overview?.top_100 ?? 0;
  const notRanked = overview?.not_ranked ?? 0;
  const hasData = overview != null;

  return (
    <IntelCard icon={BarChart2} label="Rankings" loading={loading} lastUpdated={lastUpdated} href={seoRoutes.rankings()}>
      {!hasData ? (
        <p className="text-[12px] italic text-[var(--pl-text-muted)]">No keyword project yet</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[22px] font-extrabold text-[var(--pl-text)]">{total.toLocaleString()}</span>
            <span className="text-[12px] text-[var(--pl-text-muted)]">keywords</span>
            {avgRank != null && (
              <span className="ml-auto text-[12px] text-[var(--pl-text-soft)]">
                avg rank <span className="font-bold text-[var(--pl-text)]">#{Math.round(avgRank)}</span>
              </span>
            )}
          </div>
          {total > 0 && (
            <div className="flex gap-2 text-[11px]">
              <span style={{ color: '#22c55e' }}>Top 3: {top3}</span>
              <span style={{ color: '#14B8A6' }}>Top 10: {top10}</span>
              <span style={{ color: '#f59e0b' }}>Top 100: {top100}</span>
              {notRanked > 0 && <span className="text-[var(--pl-text-muted)]">Unranked: {notRanked}</span>}
            </div>
          )}
        </div>
      )}
    </IntelCard>
  );
}

/** Opportunities card — count + top 3 titles. */
function OpportunitiesCard({ loading, opportunities, lastUpdated }: { loading: boolean; opportunities: SeoOpportunity[]; lastUpdated: Date | null }) {
  const open = opportunities.filter((o) => o.status === 'open');
  const high = open.filter((o) => o.priority === 'high');

  return (
    <IntelCard icon={Zap} label="Opportunities" loading={loading} lastUpdated={lastUpdated} href={seoRoutes.opportunities()}>
      {open.length === 0 ? (
        <p className="text-[12px] italic text-[var(--pl-text-muted)]">No open opportunities</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[22px] font-extrabold text-[var(--pl-text)]">{open.length}</span>
            <span className="text-[12px] text-[var(--pl-text-muted)]">open</span>
            {high.length > 0 && (
              <span className="ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: 'color-mix(in srgb, #ef4444 14%, transparent)', color: '#ef4444' }}>
                {high.length} high priority
              </span>
            )}
          </div>
          <ul className="space-y-0.5">
            {open.slice(0, 3).map((o) => (
              <li key={o.id} className="truncate text-[11.5px] text-[var(--pl-text-soft)]">· {o.title}</li>
            ))}
          </ul>
        </div>
      )}
    </IntelCard>
  );
}

/** Alerts card — unread count + top titles. */
function AlertsCard({ loading, alerts, lastUpdated }: { loading: boolean; alerts: SeoAlert[]; lastUpdated: Date | null }) {
  const active = alerts.filter((a) => !a.dismissed);
  const unread = active.filter((a) => !a.read);
  const critical = active.filter((a) => a.severity === 'critical');

  return (
    <IntelCard icon={Bell} label="Alerts" loading={loading} lastUpdated={lastUpdated} href={seoRoutes.alerts()}>
      {active.length === 0 ? (
        <p className="text-[12px] italic text-[var(--pl-text-muted)]">No active alerts</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[22px] font-extrabold text-[var(--pl-text)]">{unread.length}</span>
            <span className="text-[12px] text-[var(--pl-text-muted)]">unread</span>
            {critical.length > 0 && (
              <span className="ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: 'color-mix(in srgb, #ef4444 14%, transparent)', color: '#ef4444' }}>
                {critical.length} critical
              </span>
            )}
          </div>
          <ul className="space-y-0.5">
            {active.slice(0, 3).map((a) => (
              <li key={a.id} className="truncate text-[11.5px] text-[var(--pl-text-soft)]">· {a.title}</li>
            ))}
          </ul>
        </div>
      )}
    </IntelCard>
  );
}

const CONN_STATUS_ORDER = ['connected', 'sync_running', 'needs_attention', 'permission_missing', 'token_expired', 'not_connected'];

function connStatusColor(s: string): string {
  if (s === 'connected' || s === 'sync_running') return '#22c55e';
  if (s === 'needs_attention' || s === 'permission_missing') return '#f59e0b';
  if (s === 'token_expired') return '#ef4444';
  return '#64748b';
}

/** Connection health card — integrations summary. */
function ConnectionHealthCard({ loading, integrations, lastUpdated }: { loading: boolean; integrations: SeoIntegrationStatus[]; lastUpdated: Date | null }) {
  const connected = integrations.filter((i) => i.status === 'connected' || i.status === 'sync_running');
  const needsAttention = integrations.filter((i) => ['needs_attention', 'permission_missing', 'token_expired'].includes(i.status));
  const sorted = [...integrations].sort((a, b) => CONN_STATUS_ORDER.indexOf(a.status) - CONN_STATUS_ORDER.indexOf(b.status));

  return (
    <IntelCard icon={connected.length > 0 ? Wifi : WifiOff} label="Connections" loading={loading} lastUpdated={lastUpdated} href={seoRoutes.connections()}>
      {integrations.length === 0 ? (
        <p className="text-[12px] italic text-[var(--pl-text-muted)]">No integrations configured</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[22px] font-extrabold text-[var(--pl-text)]">{connected.length}</span>
            <span className="text-[12px] text-[var(--pl-text-muted)]">of {integrations.length} connected</span>
            {needsAttention.length > 0 && (
              <span className="ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: 'color-mix(in srgb, #f59e0b 14%, transparent)', color: '#f59e0b' }}>
                {needsAttention.length} needs attention
              </span>
            )}
          </div>
          <ul className="space-y-0.5">
            {sorted.slice(0, 3).map((i) => {
              const color = connStatusColor(i.status);
              return (
                <li key={i.platform} className="flex items-center gap-1.5 text-[11.5px]">
                  <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: color }} />
                  <span className="truncate text-[var(--pl-text-soft)]">{i.name}</span>
                  <span className="ml-auto capitalize text-[10.5px]" style={{ color }}>{i.status.replace(/_/g, ' ')}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </IntelCard>
  );
}

/** Full intel row — 5 cards in a responsive grid. */
function IntelRow({ sites }: { sites: SeoDurableSite[] }) {
  const [intel, setIntel] = useState<IntelState>({
    loading: true,
    rankOverview: null,
    opportunities: [],
    alerts: [],
    integrations: [],
    lastUpdated: null,
  });

  useEffect(() => {
    if (sites.length === 0) {
      setIntel((s) => ({ ...s, loading: false, lastUpdated: new Date() }));
      return;
    }
    let alive = true;
    const siteId = sites[0].id;

    async function load() {
      // Load keyword projects first (needed for rankOverview — requires project_id).
      const projectsEnv = await seoApi.keywordProjects(siteId);
      const projects: SeoKeywordProject[] = projectsEnv.backendUp ? (projectsEnv.projects ?? []) : [];

      // Fire all remaining requests in parallel; each degrades gracefully.
      const [oppEnv, alertEnv, intEnv] = await Promise.all([
        seoApi.opportunities(siteId),
        seoApi.alerts(siteId),
        seoApi.integrations(),
      ]);

      // Rank overview requires a project_id — use the first project found.
      let rankOverview: SeoRankOverview | null = null;
      if (projects.length > 0) {
        const rankEnv = await seoApi.rankOverview(projects[0].id);
        if (rankEnv.backendUp) {
          // rankOverview returns the SeoRankOverview fields spread into the envelope
          const { backendUp: _bu, error: _err, ...rest } = rankEnv as { backendUp: boolean; error?: string } & Partial<SeoRankOverview>;
          if (Object.keys(rest).length > 0) rankOverview = rest as SeoRankOverview;
        }
      }

      if (!alive) return;
      setIntel({
        loading: false,
        rankOverview,
        opportunities: oppEnv.backendUp ? (oppEnv.opportunities ?? []) : [],
        alerts: alertEnv.backendUp ? (alertEnv.alerts ?? []) : [],
        integrations: intEnv.backendUp ? (intEnv.integrations ?? []) : [],
        lastUpdated: new Date(),
      });
    }

    load();
    return () => { alive = false; };
  }, [sites]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <RankingCard loading={intel.loading} overview={intel.rankOverview} lastUpdated={intel.lastUpdated} />
      <OpportunitiesCard loading={intel.loading} opportunities={intel.opportunities} lastUpdated={intel.lastUpdated} />
      <AlertsCard loading={intel.loading} alerts={intel.alerts} lastUpdated={intel.lastUpdated} />
      <ConnectionHealthCard loading={intel.loading} integrations={intel.integrations} lastUpdated={intel.lastUpdated} />
    </div>
  );
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

  const sites = rows.map((r) => r.site);

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

      {/* Intelligence cards — keywords, opportunities, alerts, connection health */}
      <IntelRow sites={sites} />

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
