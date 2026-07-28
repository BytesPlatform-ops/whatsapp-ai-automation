'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Download, Upload, RefreshCw, Loader2, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoCitation } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

function ConsistencyBadge({ consistent }: { consistent?: boolean | null }) {
  if (consistent === true) return <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}><CheckCircle2 size={9} /> Consistent</span>;
  if (consistent === false) return <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}><AlertTriangle size={9} /> Inconsistent</span>;
  return <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-[var(--pl-text-muted)]">Unknown</span>;
}

function ClaimedBadge({ claimed }: { claimed?: boolean | null }) {
  if (claimed === true) return <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}>Claimed</span>;
  if (claimed === false) return <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-[var(--pl-text-muted)]">Unclaimed</span>;
  return null;
}

export function SeoCitationsPanel({ initialLocationId }: { initialLocationId?: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [citations, setCitations] = useState<SeoCitation[]>([]);
  const [consistentFilter, setConsistentFilter] = useState<'all' | 'consistent' | 'inconsistent'>('all');
  const [claimedFilter, setClaimedFilter] = useState<'all' | 'claimed' | 'unclaimed'>('all');
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    const env = await seoApi.citations({ location_id: initialLocationId });
    if (!env.backendUp) { setStatus('offline'); return; }
    setCitations(env.citations ?? []);
    setStatus('done');
  }, [initialLocationId]);

  useEffect(() => { load(); }, [load]);

  async function handleCheck() {
    if (!initialLocationId) return;
    setChecking(true);
    await seoApi.checkCitationConsistency(initialLocationId);
    setChecking(false);
    load();
  }

  async function handleExport() {
    const env = await seoApi.exportCitations(initialLocationId);
    if (env.csv) {
      const blob = new Blob([env.csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'citations.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !initialLocationId) return;
    setImporting(true);
    const text = await file.text();
    await seoApi.importCitations(initialLocationId, text);
    setImporting(false);
    load();
  }

  const visible = citations.filter((c) => {
    if (consistentFilter === 'consistent' && c.consistent !== true) return false;
    if (consistentFilter === 'inconsistent' && c.consistent !== false) return false;
    if (claimedFilter === 'claimed' && c.claimed !== true) return false;
    if (claimedFilter === 'unclaimed' && c.claimed !== false) return false;
    return true;
  });

  const inconsistentCount = citations.filter((c) => c.consistent === false).length;

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-20" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {/* Summary strip */}
      {citations.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
          <FileText size={14} style={{ color: ACCENT }} />
          <span className="text-[13px] text-[var(--pl-text-soft)]">{citations.length} citations</span>
          {inconsistentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: '#f59e0b' }}>
              <AlertTriangle size={12} /> {inconsistentCount} inconsistent
            </span>
          )}
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filters */}
        <select
          value={consistentFilter}
          onChange={(e) => setConsistentFilter(e.target.value as typeof consistentFilter)}
          className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--pl-text)] outline-none"
        >
          <option value="all">All consistency</option>
          <option value="consistent">Consistent</option>
          <option value="inconsistent">Inconsistent</option>
        </select>
        <select
          value={claimedFilter}
          onChange={(e) => setClaimedFilter(e.target.value as typeof claimedFilter)}
          className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--pl-text)] outline-none"
        >
          <option value="all">Claimed &amp; unclaimed</option>
          <option value="claimed">Claimed</option>
          <option value="unclaimed">Unclaimed</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          {initialLocationId && (
            <button onClick={handleCheck} disabled={checking} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-60">
              <RefreshCw size={12} className={checking ? 'animate-spin' : ''} style={{ color: ACCENT }} />
              {checking ? 'Checking…' : 'Check Consistency'}
            </button>
          )}
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">
            <Download size={12} style={{ color: ACCENT }} /> Export
          </button>
          {initialLocationId && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">
              {importing ? <Loader2 size={12} className="animate-spin" style={{ color: ACCENT }} /> : <Upload size={12} style={{ color: ACCENT }} />}
              {importing ? 'Importing…' : 'Import CSV'}
              <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
            </label>
          )}
        </div>
      </div>

      {citations.length === 0 ? (
        <EmptyState
          title="No citations yet"
          body="Import a CSV of your business directory listings to track consistency and claimed status."
        />
      ) : visible.length === 0 ? (
        <p className="text-[13px] italic text-[var(--pl-text-muted)]">No citations match the current filters.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--pl-border)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--pl-border)] bg-[var(--pl-surface-soft)]">
                  {['Directory', 'Name Listed', 'Address Listed', 'Phone Listed', 'Consistent', 'Claimed', 'Last Checked'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-[var(--pl-text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((c, i) => (
                  <tr key={c.id} className={`border-b border-[var(--pl-border)] ${i % 2 === 0 ? '' : 'bg-[var(--pl-surface-soft)]'}`}>
                    <td className="px-3 py-2">
                      {c.listing_url
                        ? <a href={c.listing_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[var(--pl-text-soft)] underline">{c.directory ?? '—'} <ExternalLink size={10} style={{ color: ACCENT }} /></a>
                        : <span className="font-medium text-[var(--pl-text-soft)]">{c.directory ?? '—'}</span>}
                    </td>
                    <td className="px-3 py-2 text-[var(--pl-text-muted)]">{c.name_on_listing ?? '—'}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-[var(--pl-text-muted)]">{c.address_on_listing ?? '—'}</td>
                    <td className="px-3 py-2 text-[var(--pl-text-muted)]">{c.phone_on_listing ?? '—'}</td>
                    <td className="px-3 py-2"><ConsistencyBadge consistent={c.consistent} /></td>
                    <td className="px-3 py-2"><ClaimedBadge claimed={c.claimed} /></td>
                    <td className="px-3 py-2 text-[var(--pl-text-muted)]">
                      {c.last_checked_at ? new Date(c.last_checked_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
