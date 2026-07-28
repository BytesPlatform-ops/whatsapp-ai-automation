'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Search, Upload, Download, Loader2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoKeywordProject, SeoKeyword, SeoResearchKeyword } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';
import Link from 'next/link';

const ACCENT = '#14B8A6';

function difficultyColor(d?: number | null): string {
  if (d == null) return '#64748b';
  if (d < 35) return '#22c55e';
  if (d < 65) return '#f59e0b';
  return '#ef4444';
}

function difficultyLabel(d?: number | null): string {
  if (d == null) return '—';
  if (d < 35) return 'Easy';
  if (d < 65) return 'Medium';
  return 'Hard';
}

function intentBadge(intent?: string | null) {
  const colors: Record<string, string> = {
    informational: '#3b82f6',
    navigational: '#8b5cf6',
    commercial: '#f59e0b',
    transactional: '#22c55e',
  };
  const color = colors[intent?.toLowerCase() ?? ''] ?? '#64748b';
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {intent ?? 'unknown'}
    </span>
  );
}

function ResearchDrawer({ projectId, onImport }: { projectId: string; onImport: () => void }) {
  const [seed, setSeed] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<SeoResearchKeyword[]>([]);
  const [adding, setAdding] = useState<Set<string>>(new Set());

  async function research() {
    if (!seed.trim()) return;
    setStatus('loading');
    const d = await seoApi.research(seed.trim(), { project_id: projectId });
    if (!d.backendUp || !d.keywords) { setStatus('error'); return; }
    setResults(d.keywords);
    setStatus('done');
  }

  async function addKeyword(kw: SeoResearchKeyword) {
    setAdding((s) => new Set(s).add(kw.keyword));
    await seoApi.addKeyword(projectId, kw.keyword);
    setAdding((s) => { const n = new Set(s); n.delete(kw.keyword); return n; });
    onImport();
  }

  return (
    <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4">
      <p className="mb-3 text-[12.5px] font-bold text-[var(--pl-text-soft)]">Keyword Research</p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
          placeholder="Seed keyword (e.g. 'website design')"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') research(); }}
        />
        <button
          onClick={research}
          disabled={status === 'loading' || !seed.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-[#02120f] disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Research
        </button>
      </div>
      {status === 'error' && <p className="mt-2 text-[12px] text-amber-500">Research failed — check your seed keyword or try again.</p>}
      {status === 'done' && results.length === 0 && <p className="mt-2 text-[12px] text-[var(--pl-text-muted)]">No results found for this seed.</p>}
      {results.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {results.map((kw) => (
            <div key={kw.keyword} className="flex items-center gap-3 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2">
              <span className="flex-1 text-[12.5px] font-medium text-[var(--pl-text)]">{kw.keyword}</span>
              {kw.search_volume != null && <span className="text-[11.5px] text-[var(--pl-text-muted)]">{kw.search_volume.toLocaleString()}/mo</span>}
              {kw.difficulty != null && (
                <span className="text-[11.5px] font-semibold" style={{ color: difficultyColor(kw.difficulty) }}>
                  {difficultyLabel(kw.difficulty)}
                </span>
              )}
              <button
                onClick={() => addKeyword(kw)}
                disabled={adding.has(kw.keyword)}
                className="rounded-md px-2 py-1 text-[11px] font-bold text-[#02120f] disabled:opacity-50"
                style={{ background: ACCENT }}
              >
                {adding.has(kw.keyword) ? <Loader2 size={11} className="animate-spin" /> : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddKeywordForm({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!keyword.trim()) return;
    setBusy(true); setMsg(null);
    const d = await seoApi.addKeyword(projectId, keyword.trim());
    setBusy(false);
    if (d.backendUp && d.keyword) { setKeyword(''); onAdded(); }
    else setMsg('Failed to add keyword — try again.');
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="flex-1 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
        placeholder="Add keyword…"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <button
        onClick={submit}
        disabled={busy || !keyword.trim()}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[12.5px] font-bold text-[#02120f] disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add
      </button>
      {msg && <p className="text-[11.5px] text-amber-500">{msg}</p>}
    </div>
  );
}

function KeywordRow({ kw, onDelete }: { kw: SeoKeyword; onDelete: () => void }) {
  const [deleting, setDeleting] = useState(false);
  async function del() {
    setDeleting(true);
    await seoApi.deleteKeyword(kw.id);
    onDelete();
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[13.5px] font-bold text-[var(--pl-text)]">{kw.keyword}</p>
        <div className="mt-0.5 flex flex-wrap gap-3 text-[11.5px] text-[var(--pl-text-muted)]">
          {kw.search_volume != null && <span>{kw.search_volume.toLocaleString()}/mo</span>}
          {kw.cpc != null && <span>${kw.cpc.toFixed(2)} CPC</span>}
          {kw.intent && intentBadge(kw.intent)}
        </div>
      </div>
      {kw.difficulty != null && (
        <span className="hidden text-[12px] font-semibold sm:block" style={{ color: difficultyColor(kw.difficulty) }}>
          {difficultyLabel(kw.difficulty)}
        </span>
      )}
      {kw.current_rank != null && (
        <span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={{ background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`, color: ACCENT }}>
          #{kw.current_rank}
        </span>
      )}
      <button
        onClick={del}
        disabled={deleting}
        className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-red-400 disabled:opacity-40"
        title="Remove keyword"
      >
        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </div>
  );
}

function ProjectSection({
  project,
  defaultOpen,
}: {
  project: SeoKeywordProject;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [keywords, setKeywords] = useState<SeoKeyword[]>([]);
  const [kwStatus, setKwStatus] = useState<'idle' | 'loading' | 'done' | 'offline'>('idle');
  const [showResearch, setShowResearch] = useState(false);

  const load = useCallback(async () => {
    setKwStatus('loading');
    const d = await seoApi.keywords(project.id);
    if (!d.backendUp) { setKwStatus('offline'); return; }
    setKeywords(d.keywords ?? []);
    setKwStatus('done');
  }, [project.id]);

  useEffect(() => {
    if (open && kwStatus === 'idle') load();
  }, [open, kwStatus, load]);

  async function exportCsv() {
    const d = await seoApi.exportKeywordsCsv(project.id);
    if (d.backendUp && d.csv) {
      const blob = new Blob([d.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `keywords-${project.id}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] overflow-hidden">
      <button
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={15} style={{ color: ACCENT }} /> : <ChevronRight size={15} className="text-[var(--pl-text-muted)]" />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{project.name}</p>
          {project.keyword_count != null && (
            <p className="text-[11.5px] text-[var(--pl-text-muted)]">{project.keyword_count} keywords</p>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={exportCsv}
            title="Export CSV"
            className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]"
          >
            <Download size={13} />
          </button>
          <Link
            href={seoRoutes.rankings({ project_id: project.id })}
            className="rounded-lg border border-[var(--pl-border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            Rankings
          </Link>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--pl-border)] px-4 pb-4 pt-3 space-y-3">
          <AddKeywordForm projectId={project.id} onAdded={load} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowResearch((s) => !s)}
              className="inline-flex items-center gap-1 text-[12px] font-semibold"
              style={{ color: ACCENT }}
            >
              <Search size={12} /> {showResearch ? 'Hide research' : 'Research keywords'}
            </button>
            <button
              onClick={load}
              disabled={kwStatus === 'loading'}
              className="ml-auto inline-flex items-center gap-1 text-[12px] text-[var(--pl-text-muted)] hover:text-[var(--pl-text)]"
            >
              <RefreshCw size={11} className={kwStatus === 'loading' ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {showResearch && <ResearchDrawer projectId={project.id} onImport={load} />}

          {kwStatus === 'loading' && <LoadingCards count={3} height="h-14" />}
          {kwStatus === 'offline' && <p className="text-[12.5px] text-amber-500">Could not load keywords — service offline.</p>}
          {kwStatus === 'done' && keywords.length === 0 && (
            <p className="text-[13px] text-[var(--pl-text-muted)]">No keywords yet. Add one above or use Research.</p>
          )}
          {kwStatus === 'done' && keywords.length > 0 && (
            <div className="space-y-2">
              {keywords.map((kw) => (
                <KeywordRow key={kw.id} kw={kw} onDelete={load} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewProjectForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setMsg('Project name is required.'); return; }
    setBusy(true); setMsg(null);
    const d = await seoApi.createKeywordProject({ name: name.trim() });
    setBusy(false);
    if (d.backendUp && d.project) { setName(''); onCreated(); }
    else setMsg('Failed to create project.');
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="flex-1 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
        placeholder="New project name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[12.5px] font-bold text-[#02120f] disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create
      </button>
      {msg && <p className="text-[11.5px] text-amber-500">{msg}</p>}
    </div>
  );
}

export function SeoKeywordsPanel({ initialSiteId, initialProjectId }: { initialSiteId?: string; initialProjectId?: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [projects, setProjects] = useState<SeoKeywordProject[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    const d = await seoApi.keywordProjects(initialSiteId);
    if (!d.backendUp) { setStatus('offline'); return; }
    setProjects(d.projects ?? []);
    setLastUpdated(new Date());
    setStatus('done');
  }, [initialSiteId]);

  useEffect(() => { load(); }, [load]);

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-16" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState
          service="SEO"
          action={
            <button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">
              Retry
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {lastUpdated && (
        <p className="text-[11.5px] text-[var(--pl-text-muted)]">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      <NewProjectForm onCreated={load} />

      {projects.length === 0 ? (
        <EmptyState
          title="No keyword projects yet"
          body="Create a project to start tracking keywords, run research, and monitor your rankings."
          action={null}
        />
      ) : (
        <div className="space-y-3">
          {projects.map((p, i) => (
            <ProjectSection
              key={p.id}
              project={p}
              defaultOpen={i === 0 || p.id === initialProjectId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
