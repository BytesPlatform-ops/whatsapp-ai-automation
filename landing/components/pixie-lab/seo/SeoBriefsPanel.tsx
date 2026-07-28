'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, Loader2, CheckCircle, Archive, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoBrief, SeoBriefSection } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

const STATUS_COLOR: Record<string, string> = {
  draft: '#64748b',
  approved: '#22c55e',
  archived: '#94a3b8',
  handed_off: '#8b5cf6',
};

function statusBadge(status?: string) {
  const color = STATUS_COLOR[status ?? ''] ?? '#64748b';
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {status?.replace(/_/g, ' ') ?? 'draft'}
    </span>
  );
}

function OutlineView({ sections }: { sections: SeoBriefSection[] }) {
  if (!sections.length) return null;
  return (
    <div className="mt-3 space-y-1">
      {sections.map((s, i) => (
        <div key={i} className="flex items-start gap-2">
          <span
            className="mt-0.5 flex-none rounded px-1 text-[10px] font-bold uppercase"
            style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}
          >
            H{s.level ?? 2}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--pl-text)]">{s.heading}</p>
            {s.notes && <p className="text-[12px] text-[var(--pl-text-muted)]">{s.notes}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function BriefCard({ brief, onUpdate }: { brief: SeoBrief; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(action: 'generate' | 'approve' | 'archive' | 'duplicate' | 'handoff') {
    setBusy(action);
    switch (action) {
      case 'generate': await seoApi.generateBrief(brief.id); break;
      case 'approve': await seoApi.approveBrief(brief.id); break;
      case 'archive': await seoApi.archiveBrief(brief.id); break;
      case 'duplicate': await seoApi.duplicateBrief(brief.id); break;
      case 'handoff': {
        const d = await seoApi.handoffBrief(brief.id);
        if (d.handoff_url) window.open(d.handoff_url, '_blank');
        break;
      }
    }
    setBusy(null);
    onUpdate();
  }

  const isArchived = brief.status === 'archived';

  return (
    <div
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] overflow-hidden"
      style={{ opacity: isArchived ? 0.6 : 1 }}
    >
      <button
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT }}>
          <FileText size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{brief.title ?? brief.keyword ?? 'Untitled brief'}</p>
            {statusBadge(brief.status)}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3 text-[12px] text-[var(--pl-text-muted)]">
            {brief.keyword && <span>Keyword: <span className="font-semibold text-[var(--pl-text-soft)]">{brief.keyword}</span></span>}
            {brief.target_word_count && <span>{brief.target_word_count.toLocaleString()} words</span>}
            {brief.created_at && <span>{new Date(brief.created_at).toLocaleDateString()}</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--pl-border)] px-4 pb-4 pt-3">
          {brief.notes && <p className="mb-3 text-[13px] text-[var(--pl-text-muted)]">{brief.notes}</p>}
          {brief.outline && brief.outline.length > 0
            ? <OutlineView sections={brief.outline} />
            : <p className="text-[12.5px] text-[var(--pl-text-muted)]">No outline generated yet — click Generate to create one.</p>
          }
          {!isArchived && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--pl-border)] pt-3">
              <button
                onClick={() => act('generate')}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-[#02120f] disabled:opacity-50"
                style={{ background: ACCENT }}
              >
                {busy === 'generate' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Generate
              </button>
              {brief.status === 'draft' && (
                <button
                  onClick={() => act('approve')}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)] disabled:opacity-50"
                >
                  {busy === 'approve' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Approve
                </button>
              )}
              {brief.status === 'approved' && (
                <button
                  onClick={() => act('handoff')}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)] disabled:opacity-50"
                >
                  {busy === 'handoff' ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />} Hand off
                </button>
              )}
              <button
                onClick={() => act('duplicate')}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)] disabled:opacity-50"
              >
                {busy === 'duplicate' ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />} Duplicate
              </button>
              <button
                onClick={() => act('archive')}
                disabled={busy !== null}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-red-400 disabled:opacity-50"
              >
                {busy === 'archive' ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />} Archive
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateBriefForm({ onCreated }: { onCreated: () => void }) {
  const [keyword, setKeyword] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!keyword.trim()) { setMsg('Keyword is required.'); return; }
    setBusy(true); setMsg(null);
    const d = await seoApi.createBrief({ keyword: keyword.trim(), title: title.trim() || undefined });
    setBusy(false);
    if (d.backendUp && d.brief) { setKeyword(''); setTitle(''); onCreated(); }
    else setMsg('Failed to create brief.');
  }

  const input = 'rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]';
  return (
    <div className="space-y-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4">
      <p className="text-[12.5px] font-bold text-[var(--pl-text-soft)]">New brief</p>
      <div className="flex flex-wrap gap-2">
        <input className={`${input} flex-1 min-w-0`} placeholder="Target keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <input className={`${input} flex-1 min-w-0`} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button
          onClick={submit}
          disabled={busy || !keyword.trim()}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[12.5px] font-bold text-[#02120f] disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
        </button>
      </div>
      {msg && <p className="text-[11.5px] text-amber-500">{msg}</p>}
    </div>
  );
}

export function SeoBriefsPanel({ initialSiteId, initialProjectId }: { initialSiteId?: string; initialProjectId?: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [briefs, setBriefs] = useState<SeoBrief[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filter, setFilter] = useState<'all' | 'draft' | 'approved' | 'archived' | 'handed_off'>('all');

  // Suppress unused param warnings — passed for future filter-by-site/project use.
  void initialSiteId; void initialProjectId;

  const load = useCallback(async () => {
    setStatus('loading');
    const d = await seoApi.briefs(initialSiteId, initialProjectId);
    if (!d.backendUp) { setStatus('offline'); return; }
    setBriefs(d.briefs ?? []);
    setLastUpdated(new Date());
    setStatus('done');
  }, [initialSiteId, initialProjectId]);

  useEffect(() => { load(); }, [load]);

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-20" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  const filtered = filter === 'all' ? briefs : briefs.filter((b) => b.status === filter);

  return (
    <div className="mt-6 space-y-5">
      {lastUpdated && (
        <p className="text-[11.5px] text-[var(--pl-text-muted)]">Updated {lastUpdated.toLocaleString()}</p>
      )}
      <CreateBriefForm onCreated={load} />

      {briefs.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-1">
          {(['all', 'draft', 'approved', 'handed_off', 'archived'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold capitalize transition"
              style={{
                background: filter === f ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
                color: filter === f ? 'var(--pl-text)' : 'var(--pl-text-muted)',
              }}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={briefs.length === 0 ? 'No content briefs yet' : `No ${filter.replace(/_/g, ' ')} briefs`}
          body={briefs.length === 0 ? 'Create a brief above. Enter a target keyword and Pixie will generate a full content outline.' : ''}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => <BriefCard key={b.id} brief={b} onUpdate={load} />)}
        </div>
      )}
    </div>
  );
}
