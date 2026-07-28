'use client';

import { useCallback, useEffect, useState } from 'react';
import { Zap, Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoDurableSite, SeoOpportunity } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';
import Link from 'next/link';

const ACCENT = '#14B8A6';

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

function priorityBadge(p?: string | null) {
  const color = PRIORITY_COLOR[p ?? ''] ?? '#64748b';
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {p ?? 'unknown'}
    </span>
  );
}

function OpportunityCard({ opp, onUpdate }: { opp: SeoOpportunity; onUpdate: () => void }) {
  const [actioning, setActioning] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  async function action() {
    setActioning(true);
    await seoApi.actionOpportunity(opp.id);
    setActioning(false);
    onUpdate();
  }

  async function dismiss() {
    setDismissing(true);
    await seoApi.dismissOpportunity(opp.id);
    setDismissing(false);
    onUpdate();
  }

  const isDone = opp.status === 'actioned' || opp.status === 'dismissed';

  return (
    <div
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4 transition"
      style={{ opacity: isDone ? 0.55 : 1 }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}
        >
          <Zap size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{opp.title}</p>
            {priorityBadge(opp.priority)}
            {opp.type && (
              <span className="rounded-full px-2 py-0.5 text-[10.5px] text-[var(--pl-text-muted)] border border-[var(--pl-border)]">{opp.type.replace(/_/g, ' ')}</span>
            )}
          </div>
          {opp.description && <p className="mt-1 text-[13px] leading-relaxed text-[var(--pl-text-muted)]">{opp.description}</p>}
          {opp.keyword && (
            <p className="mt-1 text-[12px] text-[var(--pl-text-soft)]">
              Keyword: <span className="font-semibold">{opp.keyword}</span>
            </p>
          )}
          {opp.estimated_traffic_gain != null && (
            <p className="mt-1 text-[12px]" style={{ color: ACCENT }}>
              Est. traffic gain: +{opp.estimated_traffic_gain.toLocaleString()}/mo
            </p>
          )}
        </div>
      </div>
      {!isDone && (
        <div className="mt-3 flex items-center gap-2 pt-2 border-t border-[var(--pl-border)]">
          <button
            onClick={action}
            disabled={actioning}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-[#02120f] disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {actioning ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Mark actioned
          </button>
          <button
            onClick={dismiss}
            disabled={dismissing}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
          >
            {dismissing ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
            Dismiss
          </button>
        </div>
      )}
      {isDone && (
        <p className="mt-2 text-[11.5px] font-semibold capitalize text-[var(--pl-text-muted)]">
          {opp.status}
        </p>
      )}
    </div>
  );
}

export function SeoOpportunitiesPanel({ initialSiteId }: { initialSiteId?: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [sites, setSites] = useState<SeoDurableSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<string | null>(initialSiteId ?? null);
  const [opportunities, setOpportunities] = useState<SeoOpportunity[]>([]);
  const [generating, setGenerating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'actioned' | 'dismissed'>('open');

  const loadSites = useCallback(async () => {
    setStatus('loading');
    const d = await seoApi.listSites();
    if (!d.backendUp) { setStatus('offline'); return; }
    const ss = d.sites ?? [];
    setSites(ss);
    if (!selectedSite && ss.length > 0) setSelectedSite(ss[0].id);
    setStatus('done');
  }, [selectedSite]);

  const loadOpportunities = useCallback(async (siteId: string) => {
    const d = await seoApi.opportunities(siteId);
    if (d.backendUp) { setOpportunities(d.opportunities ?? []); setLastUpdated(new Date()); }
  }, []);

  useEffect(() => { loadSites(); }, [loadSites]);
  useEffect(() => { if (selectedSite) loadOpportunities(selectedSite); }, [selectedSite, loadOpportunities]);

  async function generate() {
    if (!selectedSite) return;
    setGenerating(true);
    await seoApi.generateOpportunities(selectedSite);
    setGenerating(false);
    loadOpportunities(selectedSite);
  }

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={4} height="h-28" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState
          service="SEO"
          action={<button onClick={loadSites} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>}
        />
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No sites registered"
          body="Register a site first, then run a crawl to generate opportunities."
          action={
            <Link href={seoRoutes.sites()} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
              Add a site
            </Link>
          }
        />
      </div>
    );
  }

  const filtered = filter === 'all' ? opportunities : opportunities.filter((o) => o.status === filter);
  const openCount = opportunities.filter((o) => o.status === 'open').length;

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedSite ?? ''}
          onChange={(e) => { setSelectedSite(e.target.value); }}
          className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
        >
          {sites.map((s) => <option key={s.id} value={s.id}>{s.display_name || s.domain}</option>)}
        </select>
        <button
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-[#02120f] disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {generating ? 'Generating…' : 'Generate'}
        </button>
        {lastUpdated && (
          <span className="ml-auto text-[11.5px] text-[var(--pl-text-muted)]">Updated {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      {/* Filter tabs */}
      {opportunities.length > 0 && (
        <div className="flex gap-1 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-1">
          {(['open', 'all', 'actioned', 'dismissed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold capitalize transition"
              style={{
                background: filter === f ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
                color: filter === f ? 'var(--pl-text)' : 'var(--pl-text-muted)',
              }}
            >
              {f} {f === 'open' && openCount > 0 ? `(${openCount})` : ''}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={opportunities.length === 0 ? 'No opportunities yet' : `No ${filter} opportunities`}
          body={
            opportunities.length === 0
              ? 'Click Generate to analyse your site for content and technical opportunities.'
              : `There are no opportunities with status "${filter}".`
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered
            .sort((a, b) => {
              const order = { high: 0, medium: 1, low: 2 };
              return (order[a.priority ?? 'low'] ?? 2) - (order[b.priority ?? 'low'] ?? 2);
            })
            .map((opp) => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                onUpdate={() => selectedSite && loadOpportunities(selectedSite)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
