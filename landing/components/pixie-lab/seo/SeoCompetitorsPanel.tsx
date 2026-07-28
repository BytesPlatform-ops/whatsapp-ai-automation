'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoDurableSite, SeoCompetitor, SeoCompetitorGapItem } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

function GapTable({ items }: { items: SeoCompetitorGapItem[] }) {
  if (!items.length) return <p className="text-[13px] text-[var(--pl-text-muted)]">No gap data available yet.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--pl-border)]">
      <table className="min-w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-[var(--pl-border)] bg-[var(--pl-surface-soft)]">
            {['Keyword', 'Competitor', 'Their rank', 'Our rank', 'Volume', 'Opp. score'].map((h) => (
              <th key={h} className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--pl-border)]">
          {items.slice(0, 50).map((item, i) => (
            <tr key={i} className="bg-[var(--pl-surface)] hover:bg-[var(--pl-surface-hover)] transition">
              <td className="px-3 py-2.5 font-medium text-[var(--pl-text)]">{item.keyword}</td>
              <td className="px-3 py-2.5 text-[var(--pl-text-muted)]">{item.competitor_domain}</td>
              <td className="px-3 py-2.5">
                {item.competitor_rank != null ? (
                  <span className="font-semibold" style={{ color: ACCENT }}>#{item.competitor_rank}</span>
                ) : <span className="text-[var(--pl-text-muted)]">—</span>}
              </td>
              <td className="px-3 py-2.5">
                {item.our_rank != null ? (
                  <span className="font-semibold text-[var(--pl-text)]">#{item.our_rank}</span>
                ) : <span className="text-[var(--pl-text-muted)]">Not ranked</span>}
              </td>
              <td className="px-3 py-2.5 text-[var(--pl-text-muted)]">
                {item.search_volume != null ? item.search_volume.toLocaleString() : '—'}
              </td>
              <td className="px-3 py-2.5">
                {item.opportunity_score != null ? (
                  <span
                    className="inline-flex items-center gap-0.5 font-semibold"
                    style={{ color: item.opportunity_score > 70 ? '#22c55e' : item.opportunity_score > 40 ? '#f59e0b' : '#64748b' }}
                  >
                    {item.opportunity_score > 70 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {Math.round(item.opportunity_score)}
                  </span>
                ) : <span className="text-[var(--pl-text-muted)]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddCompetitorForm({ siteId, onAdded }: { siteId: string; onAdded: () => void }) {
  const [domain, setDomain] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!domain.trim()) { setMsg('Domain is required.'); return; }
    setBusy(true); setMsg(null);
    const d = await seoApi.addCompetitor({ domain: domain.trim(), site_id: siteId, display_name: displayName.trim() || undefined });
    setBusy(false);
    if (d.backendUp && d.competitor) { setDomain(''); setDisplayName(''); onAdded(); }
    else setMsg('Failed to add competitor.');
  }

  const input = 'rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]';
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={`${input} flex-1`} placeholder="competitor.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
        <input className={`${input} w-40`} placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <button
          onClick={submit}
          disabled={busy || !domain.trim()}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[12.5px] font-bold text-[#02120f] disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
        </button>
      </div>
      {msg && <p className="text-[11.5px] text-amber-500">{msg}</p>}
    </div>
  );
}

function CompetitorCard({ competitor, onDelete }: { competitor: SeoCompetitor; onDelete: () => void }) {
  const [deleting, setDeleting] = useState(false);
  async function del() {
    setDeleting(true);
    await seoApi.deleteCompetitor(competitor.id);
    onDelete();
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[var(--pl-surface-soft)]" style={{ color: ACCENT }}>
        <Users size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[13.5px] font-bold text-[var(--pl-text)]">{competitor.display_name || competitor.domain}</p>
        {competitor.display_name && <p className="text-[11.5px] text-[var(--pl-text-muted)]">{competitor.domain}</p>}
      </div>
      <button
        onClick={del}
        disabled={deleting}
        className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-red-400 disabled:opacity-40"
      >
        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </div>
  );
}

export function SeoCompetitorsPanel({ initialSiteId }: { initialSiteId?: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [sites, setSites] = useState<SeoDurableSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<string | null>(initialSiteId ?? null);
  const [competitors, setCompetitors] = useState<SeoCompetitor[]>([]);
  const [gap, setGap] = useState<SeoCompetitorGapItem[] | null>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadSites = useCallback(async () => {
    setStatus('loading');
    const d = await seoApi.listSites();
    if (!d.backendUp) { setStatus('offline'); return; }
    const ss = d.sites ?? [];
    setSites(ss);
    if (!selectedSite && ss.length > 0) setSelectedSite(ss[0].id);
    setStatus('done');
  }, [selectedSite]);

  const loadCompetitors = useCallback(async (siteId: string) => {
    const d = await seoApi.competitors(siteId);
    if (d.backendUp) { setCompetitors(d.competitors ?? []); setLastUpdated(new Date()); }
  }, []);

  useEffect(() => { loadSites(); }, [loadSites]);
  useEffect(() => { if (selectedSite) loadCompetitors(selectedSite); }, [selectedSite, loadCompetitors]);

  async function analyzeGap() {
    if (!selectedSite) return;
    setGapLoading(true);
    const d = await seoApi.competitorGap(selectedSite);
    setGapLoading(false);
    if (d.backendUp && d.gap) setGap(d.gap);
  }

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-16" /></div>;
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
        <EmptyState title="No sites registered" body="Register a site first before adding competitors." />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedSite ?? ''}
          onChange={(e) => { setSelectedSite(e.target.value); setGap(null); }}
          className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
        >
          {sites.map((s) => <option key={s.id} value={s.id}>{s.display_name || s.domain}</option>)}
        </select>
        {lastUpdated && (
          <span className="ml-auto text-[11.5px] text-[var(--pl-text-muted)]">Updated {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      {selectedSite && <AddCompetitorForm siteId={selectedSite} onAdded={() => loadCompetitors(selectedSite)} />}

      {competitors.length === 0 ? (
        <EmptyState title="No competitors added" body="Add competitor domains to compare keyword rankings and find gaps." />
      ) : (
        <div className="space-y-2">
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} onDelete={() => selectedSite && loadCompetitors(selectedSite)} />
          ))}
        </div>
      )}

      {competitors.length > 0 && (
        <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">Keyword gap analysis</p>
              <p className="text-[12.5px] text-[var(--pl-text-muted)]">Keywords competitors rank for that you don't — yet.</p>
            </div>
            <button
              onClick={analyzeGap}
              disabled={gapLoading}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-[#02120f] disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              {gapLoading ? <Loader2 size={13} className="animate-spin" /> : null}
              {gapLoading ? 'Analyzing…' : 'Analyse gap'}
            </button>
          </div>
          {gap !== null && (
            <div className="mt-4">
              <GapTable items={gap} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
