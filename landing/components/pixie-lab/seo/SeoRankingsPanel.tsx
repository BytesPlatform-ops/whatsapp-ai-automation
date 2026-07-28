'use client';

import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, BarChart2 } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoKeywordProject, SeoKeyword, SeoRankOverview, SeoRankJob } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';
import Link from 'next/link';

const ACCENT = '#14B8A6';

function rankChange(kw: SeoKeyword) {
  const change = kw.rank_change ?? (kw.current_rank != null && kw.previous_rank != null ? kw.previous_rank - kw.current_rank : null);
  if (change == null) return null;
  return change;
}

function RankBadge({ rank }: { rank?: number | null }) {
  if (rank == null) return <span className="text-[12px] text-[var(--pl-text-muted)]">Not ranked</span>;
  const color = rank <= 3 ? '#22c55e' : rank <= 10 ? ACCENT : rank <= 30 ? '#f59e0b' : '#64748b';
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[12px] font-bold"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      #{rank}
    </span>
  );
}

function ChangePill({ change }: { change: number | null }) {
  if (change == null) return <span className="text-[12px] text-[var(--pl-text-muted)]">—</span>;
  if (change === 0) return <span className="inline-flex items-center gap-0.5 text-[12px] text-[var(--pl-text-muted)]"><Minus size={11} /> 0</span>;
  const up = change > 0;
  const color = up ? '#22c55e' : '#ef4444';
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold" style={{ color }}>
      <Icon size={11} /> {up ? '+' : ''}{change}
    </span>
  );
}

function OverviewBar({ overview }: { overview: SeoRankOverview }) {
  const stats = [
    { label: 'Top 3', value: overview.top_3 ?? 0, color: '#22c55e' },
    { label: 'Top 10', value: overview.top_10 ?? 0, color: ACCENT },
    { label: 'Top 100', value: overview.top_100 ?? 0, color: '#f59e0b' },
    { label: 'Not ranked', value: overview.not_ranked ?? 0, color: '#64748b' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--pl-text-muted)]">{s.label}</p>
          <p className="mt-1 text-[1.5rem] font-extrabold" style={{ color: s.color }}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function KeywordRankRow({ kw }: { kw: SeoKeyword }) {
  const change = rankChange(kw);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[13.5px] font-bold text-[var(--pl-text)]">{kw.keyword}</p>
        {kw.url && <p className="truncate text-[11.5px] text-[var(--pl-text-muted)]">{kw.url}</p>}
      </div>
      {kw.search_volume != null && (
        <span className="hidden text-[12px] text-[var(--pl-text-muted)] sm:block">{kw.search_volume.toLocaleString()}/mo</span>
      )}
      <ChangePill change={change} />
      <RankBadge rank={kw.current_rank} />
    </div>
  );
}

function CheckButton({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    await seoApi.rankCheck(projectId);
    setBusy(false);
    onDone();
  }
  return (
    <button
      onClick={check}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-[#02120f] disabled:opacity-50"
      style={{ background: ACCENT }}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      {busy ? 'Checking…' : 'Check ranks'}
    </button>
  );
}

export function SeoRankingsPanel({ initialProjectId }: { initialProjectId?: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [projects, setProjects] = useState<SeoKeywordProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(initialProjectId ?? null);
  const [keywords, setKeywords] = useState<SeoKeyword[]>([]);
  const [overview, setOverview] = useState<SeoRankOverview | null>(null);
  const [kwLoading, setKwLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadProjects = useCallback(async () => {
    setStatus('loading');
    const d = await seoApi.keywordProjects();
    if (!d.backendUp) { setStatus('offline'); return; }
    const ps = d.projects ?? [];
    setProjects(ps);
    if (!selectedProject && ps.length > 0) setSelectedProject(ps[0].id);
    setStatus('done');
  }, [selectedProject]);

  const loadKeywordsAndOverview = useCallback(async (projectId: string) => {
    setKwLoading(true);
    const [kwData, ovData] = await Promise.all([
      seoApi.keywords(projectId),
      seoApi.rankOverview(projectId),
    ]);
    setKeywords(kwData.keywords ?? []);
    if (ovData.backendUp) setOverview(ovData as unknown as SeoRankOverview);
    setKwLoading(false);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (selectedProject) loadKeywordsAndOverview(selectedProject);
  }, [selectedProject, loadKeywordsAndOverview]);

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={4} height="h-16" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState
          service="SEO"
          action={<button onClick={loadProjects} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>}
        />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No keyword projects"
          body="Create a keyword project first, then track rankings for your target keywords."
          action={
            <Link href={seoRoutes.keywords()} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
              <BarChart2 size={14} /> Go to Keywords
            </Link>
          }
        />
      </div>
    );
  }

  const rankedKeywords = keywords.filter((k) => k.current_rank != null);
  const unrankedKeywords = keywords.filter((k) => k.current_rank == null);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* Project selector */}
        <label className="sr-only" htmlFor="rankings-project-select">Select keyword project</label>
        <select
          id="rankings-project-select"
          value={selectedProject ?? ''}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
          aria-label="Select keyword project"
        >
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {selectedProject && <CheckButton projectId={selectedProject} onDone={() => loadKeywordsAndOverview(selectedProject)} />}
        {lastUpdated && (
          <span className="ml-auto text-[11.5px] text-[var(--pl-text-muted)]">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {overview && <OverviewBar overview={overview} />}

      {kwLoading ? (
        <LoadingCards count={5} height="h-14" />
      ) : keywords.length === 0 ? (
        <EmptyState title="No keywords in this project" body="Add keywords on the Keywords page first." />
      ) : (
        <div className="space-y-4">
          {rankedKeywords.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Ranked ({rankedKeywords.length})</p>
              <div className="space-y-2">
                {rankedKeywords.sort((a, b) => (a.current_rank ?? 999) - (b.current_rank ?? 999)).map((kw) => (
                  <KeywordRankRow key={kw.id} kw={kw} />
                ))}
              </div>
            </div>
          )}
          {unrankedKeywords.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Not yet ranked ({unrankedKeywords.length})</p>
              <div className="space-y-2">
                {unrankedKeywords.map((kw) => (
                  <KeywordRankRow key={kw.id} kw={kw} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
