'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight, Download, ExternalLink, Filter, RefreshCw,
  Link2, TrendingUp, TrendingDown, AlertTriangle, Search,
} from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoBacklink, SeoBacklinkOverview, SeoReferringDomain, SeoAnchorText } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

type BLView = 'overview' | 'backlinks' | 'domains' | 'new-lost' | 'anchors' | 'gap' | 'opportunities';

function MetricCard({ label, value, sub }: { label: string; value: string | number | null; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">{label}</p>
      <p className="mt-1 font-display text-[22px] font-extrabold text-[var(--pl-text)]">
        {value == null ? <span className="text-[var(--pl-text-muted)]">n/a</span> : value}
      </p>
      {sub && <p className="text-[11.5px] text-[var(--pl-text-muted)]">{sub}</p>}
    </div>
  );
}

function OverviewGrid({ ov }: { ov: SeoBacklinkOverview }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Total Backlinks" value={ov.total_backlinks ?? null} />
      <MetricCard label="Referring Domains" value={ov.referring_domains ?? null} />
      <MetricCard
        label="New (30d)"
        value={ov.new_last_30d ?? null}
        sub={ov.lost_last_30d != null ? `−${ov.lost_last_30d} lost` : undefined}
      />
      <MetricCard
        label="Follow / Nofollow"
        value={
          ov.follow_count != null && ov.nofollow_count != null
            ? `${ov.follow_count} / ${ov.nofollow_count}`
            : null
        }
      />
    </div>
  );
}

function ProviderNote() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-2.5 text-[12.5px] text-[var(--pl-text-muted)]">
      <AlertTriangle size={13} style={{ color: '#f59e0b' }} />
      Authority metrics (DR, PA) are shown only when a third-party provider is configured. Fields display "n/a" otherwise.
    </div>
  );
}

function BacklinksTable({ backlinks }: { backlinks: SeoBacklink[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'lost'>('all');
  const [followFilter, setFollowFilter] = useState<'all' | 'follow' | 'nofollow'>('all');

  const filtered = backlinks.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (followFilter === 'follow' && b.follow === false) return false;
    if (followFilter === 'nofollow' && b.follow !== false) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (b.source_domain ?? '').toLowerCase().includes(q) ||
        (b.anchor_text ?? '').toLowerCase().includes(q) ||
        (b.target_url ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-1.5">
          <Search size={13} style={{ color: ACCENT }} aria-hidden="true" />
          <label className="sr-only" htmlFor="backlinks-search">Search backlinks</label>
          <input
            id="backlinks-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search backlinks…"
            className="w-40 bg-transparent text-[12.5px] text-[var(--pl-text)] outline-none placeholder:text-[var(--pl-text-muted)]"
          />
        </div>
        <label className="sr-only" htmlFor="bl-status-filter">Status filter</label>
        <select
          id="bl-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--pl-text)] outline-none"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="lost">Lost</option>
        </select>
        <label className="sr-only" htmlFor="bl-follow-filter">Follow type filter</label>
        <select
          id="bl-follow-filter"
          value={followFilter}
          onChange={(e) => setFollowFilter(e.target.value as typeof followFilter)}
          className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--pl-text)] outline-none"
        >
          <option value="all">Follow &amp; Nofollow</option>
          <option value="follow">Follow only</option>
          <option value="nofollow">Nofollow only</option>
        </select>
        <span className="ml-auto text-[12px] text-[var(--pl-text-muted)]">{filtered.length} links</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] italic text-[var(--pl-text-muted)]">No backlinks match current filters.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--pl-border)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]" aria-label="Backlinks table">
              <thead>
                <tr className="border-b border-[var(--pl-border)] bg-[var(--pl-surface-soft)]">
                  {['Source Domain', 'Anchor', 'Target URL', 'Follow', 'Status', 'Risk', 'DR', 'First seen'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 text-left font-semibold text-[var(--pl-text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((b, i) => (
                  <tr key={b.id} className={`border-b border-[var(--pl-border)] ${i % 2 === 0 ? '' : 'bg-[var(--pl-surface-soft)]'}`}>
                    <td className="px-3 py-2 font-medium text-[var(--pl-text-soft)]">
                      {b.source_domain ?? '—'}
                      {b.source_url && (
                        <a href={b.source_url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-block align-middle">
                          <ExternalLink size={10} style={{ color: ACCENT }} />
                        </a>
                      )}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-[var(--pl-text-muted)]">{b.anchor_text || '—'}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-[var(--pl-text-muted)]">{b.target_url ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                        style={b.follow === false
                          ? { background: 'rgba(100,116,139,0.14)', color: '#64748b' }
                          : { background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}
                      >
                        {b.follow === false ? 'nofollow' : 'follow'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="capitalize"
                        style={{ color: b.status === 'lost' ? '#ef4444' : '#22c55e' }}
                      >
                        {b.status ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {b.risk ? (
                        <span style={{ color: b.risk === 'high' ? '#ef4444' : b.risk === 'medium' ? '#f59e0b' : '#22c55e' }}>
                          {b.risk}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--pl-text-muted)]">{b.domain_rating ?? 'n/a'}</td>
                    <td className="px-3 py-2 text-[var(--pl-text-muted)]">
                      {b.first_seen ? new Date(b.first_seen).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 200 && (
            <p className="border-t border-[var(--pl-border)] px-4 py-2 text-[12px] text-[var(--pl-text-muted)]">
              Showing 200 of {filtered.length} rows. Export CSV for the full set.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DomainsTable({ domains }: { domains: SeoReferringDomain[] }) {
  if (!domains.length) return <p className="text-[13px] italic text-[var(--pl-text-muted)]">No referring domains yet.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--pl-border)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-[12.5px]" aria-label="Referring domains">
          <thead>
            <tr className="border-b border-[var(--pl-border)] bg-[var(--pl-surface-soft)]">
              {['Domain', 'Backlinks', 'Follow', 'Nofollow', 'DR', 'First seen'].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-left font-semibold text-[var(--pl-text-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {domains.map((d, i) => (
              <tr key={d.domain} className={`border-b border-[var(--pl-border)] ${i % 2 === 0 ? '' : 'bg-[var(--pl-surface-soft)]'}`}>
                <td className="px-3 py-2 font-medium text-[var(--pl-text-soft)]">{d.domain}</td>
                <td className="px-3 py-2 text-[var(--pl-text)]">{d.backlink_count ?? '—'}</td>
                <td className="px-3 py-2 text-[var(--pl-text-muted)]">{d.follow_count ?? '—'}</td>
                <td className="px-3 py-2 text-[var(--pl-text-muted)]">{d.nofollow_count ?? '—'}</td>
                <td className="px-3 py-2 text-[var(--pl-text-muted)]">{d.domain_rating ?? 'n/a'}</td>
                <td className="px-3 py-2 text-[var(--pl-text-muted)]">
                  {d.first_seen ? new Date(d.first_seen).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnchorsTable({ anchors }: { anchors: SeoAnchorText[] }) {
  if (!anchors.length) return <p className="text-[13px] italic text-[var(--pl-text-muted)]">No anchor data yet.</p>;
  const total = anchors.reduce((s, a) => s + (a.count ?? 0), 0);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--pl-border)]">
      {anchors.map((a, i) => {
        const pct = total > 0 ? Math.round(((a.count ?? 0) / total) * 100) : 0;
        return (
          <div key={a.anchor + i} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-[var(--pl-border)]' : ''}`}>
            <span className="flex-1 truncate text-[12.5px] font-medium text-[var(--pl-text-soft)]">{a.anchor || '(no anchor)'}</span>
            <div className="w-24">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--pl-surface-soft)]">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ACCENT }} />
              </div>
            </div>
            <span className="w-10 text-right text-[11.5px] font-bold text-[var(--pl-text)]">{a.count ?? 0}</span>
          </div>
        );
      })}
    </div>
  );
}

const VIEW_LABELS: { v: BLView; label: string }[] = [
  { v: 'overview', label: 'Overview' },
  { v: 'backlinks', label: 'Backlinks' },
  { v: 'domains', label: 'Referring Domains' },
  { v: 'new-lost', label: 'New & Lost' },
  { v: 'anchors', label: 'Anchors' },
  { v: 'gap', label: 'Link Gaps' },
  { v: 'opportunities', label: 'Opportunities' },
];

export function SeoBacklinksPanel({ initialSiteId }: { initialSiteId?: string }) {
  const [view, setView] = useState<BLView>('overview');
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [overview, setOverview] = useState<SeoBacklinkOverview | null>(null);
  const [backlinks, setBacklinks] = useState<SeoBacklink[]>([]);
  const [domains, setDomains] = useState<SeoReferringDomain[]>([]);
  const [newBl, setNewBl] = useState<SeoBacklink[]>([]);
  const [lostBl, setLostBl] = useState<SeoBacklink[]>([]);
  const [anchors, setAnchors] = useState<SeoAnchorText[]>([]);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    const [ovEnv, blEnv, domEnv, nlEnv, ancEnv] = await Promise.all([
      seoApi.backlinkOverview(initialSiteId),
      seoApi.backlinks({ site_id: initialSiteId }),
      seoApi.referringDomains(initialSiteId),
      seoApi.backlinksNewLost(initialSiteId),
      seoApi.anchorTexts(initialSiteId),
    ]);
    if (!ovEnv.backendUp && !blEnv.backendUp) { setStatus('offline'); return; }
    setOverview(ovEnv.overview ?? null);
    setBacklinks(blEnv.backlinks ?? []);
    setDomains(domEnv.domains ?? []);
    setNewBl(nlEnv.new ?? []);
    setLostBl(nlEnv.lost ?? []);
    setAnchors(ancEnv.anchors ?? []);
    setStatus('done');
  }, [initialSiteId]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    if (!initialSiteId) return;
    setSyncing(true);
    await seoApi.backlinkSync(initialSiteId);
    setSyncing(false);
    load();
  }

  async function handleExport() {
    const env = await seoApi.exportBacklinks(initialSiteId);
    if (env.csv) {
      const blob = new Blob([env.csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backlinks-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={4} height="h-20" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <ProviderNote />

      {/* Sub-view tabs */}
      <div className="flex flex-wrap gap-1.5">
        {VIEW_LABELS.map(({ v, label }) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
            style={view === v
              ? { background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`, color: ACCENT }
              : { color: 'var(--pl-text-muted)' }}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {initialSiteId && (
            <button onClick={handleSync} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-60">
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} style={{ color: ACCENT }} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">
            <Download size={12} style={{ color: ACCENT }} /> CSV
          </button>
        </div>
      </div>

      {view === 'overview' && (
        overview
          ? <OverviewGrid ov={overview} />
          : <EmptyState title="No backlink data yet" body="Sync backlinks to populate this dashboard." />
      )}

      {view === 'backlinks' && <BacklinksTable backlinks={backlinks} />}

      {view === 'domains' && <DomainsTable domains={domains} />}

      {view === 'new-lost' && (
        <div className="space-y-5">
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#22c55e' }}>
              <TrendingUp size={12} /> New backlinks ({newBl.length})
            </p>
            {newBl.length === 0
              ? <p className="text-[13px] italic text-[var(--pl-text-muted)]">No new backlinks in the last 30 days.</p>
              : <BacklinksTable backlinks={newBl} />}
          </div>
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#ef4444' }}>
              <TrendingDown size={12} /> Lost backlinks ({lostBl.length})
            </p>
            {lostBl.length === 0
              ? <p className="text-[13px] italic text-[var(--pl-text-muted)]">No lost backlinks in the last 30 days.</p>
              : <BacklinksTable backlinks={lostBl} />}
          </div>
        </div>
      )}

      {view === 'anchors' && <AnchorsTable anchors={anchors} />}

      {(view === 'gap' || view === 'opportunities') && (
        <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6">
          <div className="flex items-center gap-2 text-[var(--pl-text-muted)]">
            <Filter size={16} />
            <p className="text-[13px]">
              {view === 'gap'
                ? 'Link Gap analysis compares your backlink profile against competitors. Add competitors on the Competitors page, then return here.'
                : 'Link building opportunities are surfaced based on competitor gaps. Add at least one competitor to generate opportunities.'}
            </p>
          </div>
          <a href="/pixie-lab/seo/competitors" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: ACCENT }}>
            Go to Competitors <ArrowUpRight size={13} />
          </a>
        </div>
      )}
    </div>
  );
}
