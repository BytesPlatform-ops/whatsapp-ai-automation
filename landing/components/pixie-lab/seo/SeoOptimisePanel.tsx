'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Loader2, ArrowUpRight } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoOptimiseResult, SeoOptimiseRecommendation, SeoCrawledPageSummary, SeoDurableSite } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';
import Link from 'next/link';

const ACCENT = '#14B8A6';

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
};

function RecommendationCard({ rec }: { rec: SeoOptimiseRecommendation }) {
  const color = PRIORITY_COLOR[rec.priority] ?? '#64748b';
  return (
    <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
        <p className="font-display text-[13.5px] font-bold capitalize text-[var(--pl-text)]">
          {rec.type.replace(/_/g, ' ')}
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold capitalize"
          style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
        >
          {rec.priority}
        </span>
      </div>
      {rec.explanation && <p className="mt-2 text-[13px] leading-relaxed text-[var(--pl-text-muted)]">{rec.explanation}</p>}
      {(rec.current_value || rec.suggested_value) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {rec.current_value && (
            <div className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-2.5">
              <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Current</p>
              <p className="text-[12.5px] text-[var(--pl-text-soft)] break-all">{rec.current_value}</p>
            </div>
          )}
          {rec.suggested_value && (
            <div className="rounded-lg border p-2.5" style={{ borderColor: `color-mix(in srgb, ${ACCENT} 40%, transparent)`, background: `color-mix(in srgb, ${ACCENT} 8%, transparent)` }}>
              <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: ACCENT }}>Suggested</p>
              <p className="text-[12.5px] text-[var(--pl-text)] break-all">{rec.suggested_value}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreDiff({ current, potential }: { current?: number | null; potential?: number | null }) {
  if (current == null && potential == null) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
      {current != null && (
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Current score</p>
          <p className="text-[1.5rem] font-extrabold" style={{ color: current >= 80 ? '#22c55e' : current >= 50 ? '#f59e0b' : '#ef4444' }}>{Math.round(current)}</p>
        </div>
      )}
      {potential != null && (
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Potential score</p>
          <p className="text-[1.5rem] font-extrabold" style={{ color: ACCENT }}>{Math.round(potential)}</p>
        </div>
      )}
    </div>
  );
}

export function SeoOptimisePanel({
  initialSiteId,
  initialPageId,
  initialKeyword,
}: {
  initialSiteId?: string;
  initialPageId?: string;
  initialKeyword?: string;
}) {
  const [sites, setSites] = useState<SeoDurableSite[]>([]);
  const [sitesStatus, setSitesStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [selectedSite, setSelectedSite] = useState<string | null>(initialSiteId ?? null);
  const [pages, setPages] = useState<SeoCrawledPageSummary[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(initialPageId ?? null);
  const [keyword, setKeyword] = useState(initialKeyword ?? '');
  const [result, setResult] = useState<SeoOptimiseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysed, setAnalysed] = useState(false);

  const loadSites = useCallback(async () => {
    setSitesStatus('loading');
    const d = await seoApi.listSites();
    if (!d.backendUp) { setSitesStatus('offline'); return; }
    const ss = d.sites ?? [];
    setSites(ss);
    if (!selectedSite && ss.length > 0) setSelectedSite(ss[0].id);
    setSitesStatus('done');
  }, [selectedSite]);

  useEffect(() => { loadSites(); }, [loadSites]);

  useEffect(() => {
    if (!selectedSite) return;
    seoApi.listPages(selectedSite, { limit: 100 }).then((d) => {
      if (d.backendUp) setPages(d.pages ?? []);
    });
  }, [selectedSite]);

  async function analyse() {
    setLoading(true);
    setResult(null);
    const d = await seoApi.optimisePage({
      site_id: selectedSite ?? undefined,
      page_id: selectedPage ?? undefined,
      keyword: keyword.trim() || undefined,
    });
    setLoading(false);
    setAnalysed(true);
    if (d.backendUp) setResult(d as unknown as SeoOptimiseResult);
  }

  if (sitesStatus === 'loading') return <div className="mt-6"><LoadingCards count={2} height="h-16" /></div>;
  if (sitesStatus === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={loadSites} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No sites registered"
          body="Register a site and run a crawl before requesting page optimisation."
          action={
            <Link href={seoRoutes.sites()} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
              Add a site
            </Link>
          }
        />
      </div>
    );
  }

  const recs = result?.recommendations ?? [];
  const highPriority = recs.filter((r) => r.priority === 'high');
  const rest = recs.filter((r) => r.priority !== 'high');

  return (
    <div className="mt-6 space-y-5">
      {/* Controls */}
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4 space-y-3">
        <p className="text-[13px] text-[var(--pl-text-muted)]">
          Select a site and (optionally) a page and target keyword to get AI-powered optimisation recommendations.
        </p>
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedSite ?? ''}
            onChange={(e) => { setSelectedSite(e.target.value); setSelectedPage(null); setResult(null); setAnalysed(false); }}
            className="flex-1 min-w-0 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
          >
            {sites.map((s) => <option key={s.id} value={s.id}>{s.display_name || s.domain}</option>)}
          </select>
          {pages.length > 0 && (
            <select
              value={selectedPage ?? ''}
              onChange={(e) => { setSelectedPage(e.target.value || null); setResult(null); setAnalysed(false); }}
              className="flex-1 min-w-0 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
            >
              <option value="">All pages / site level</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.title || p.url}</option>)}
            </select>
          )}
          <input
            className="flex-1 min-w-0 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
            placeholder="Target keyword (optional)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <button
          onClick={analyse}
          disabled={loading || !selectedSite}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-[#02120f] disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? 'Analysing…' : 'Analyse page'}
        </button>
      </div>

      {loading && <LoadingCards count={3} height="h-24" />}

      {!loading && analysed && !result && (
        <EmptyState title="Could not load analysis" body="The optimise service is offline or returned no data. Try again." />
      )}

      {result && (
        <div className="space-y-4">
          {result.url && (
            <div className="flex items-center gap-2">
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: ACCENT }}>
                <ArrowUpRight size={13} /> {result.url}
              </a>
              {result.generated_at && (
                <span className="ml-auto text-[11.5px] text-[var(--pl-text-muted)]">
                  {new Date(result.generated_at).toLocaleString()}
                </span>
              )}
            </div>
          )}

          <ScoreDiff current={result.current_score} potential={result.potential_score} />

          {recs.length === 0 ? (
            <EmptyState title="No recommendations" body="This page looks well-optimised, or no data was available to analyse." />
          ) : (
            <div className="space-y-4">
              {highPriority.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">High priority</p>
                  <div className="space-y-3">
                    {highPriority.map((r, i) => <RecommendationCard key={i} rec={r} />)}
                  </div>
                </div>
              )}
              {rest.length > 0 && (
                <div>
                  {highPriority.length > 0 && <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Other recommendations</p>}
                  <div className="space-y-3">
                    {rest.map((r, i) => <RecommendationCard key={i} rec={r} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
