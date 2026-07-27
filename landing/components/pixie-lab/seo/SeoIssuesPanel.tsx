'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, ExternalLink,
  Filter, Loader2, Search, Zap, RotateCcw,
} from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoCrawlIssue, SeoSeverity, SeoIssueStatus } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';

const ACCENT = '#14B8A6';
const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6', info: '#64748b',
};

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
      {children}
    </span>
  );
}

function IssueDetail({ issue, onResolve }: { issue: SeoCrawlIssue; onResolve: () => void }) {
  const [resolving, setResolving] = useState(false);
  const [done, setDone] = useState(issue.status === 'resolved');
  const [prepareBusy, setPrepareBusy] = useState(false);
  const [prepareResult, setPrepareResult] = useState<{ copy_text?: string; status?: string } | null>(null);

  const evidence = issue.evidence ?? {};
  const canOneTap = issue.fix_mode === 'auto_fix' || issue.fix_mode === 'approval_required';

  async function resolve() {
    setResolving(true);
    const d = await seoApi.resolveIssue(issue.id);
    setResolving(false);
    if (d.backendUp) { setDone(true); onResolve(); }
  }

  async function prepFix() {
    if (!issue.crawl_job_id) return;
    setPrepareBusy(true);
    // Use the legacy prepareFix (audit-mode) with a fallback to issue ID.
    const d = await seoApi.prepareFix(issue.crawl_job_id, issue.id);
    setPrepareBusy(false);
    setPrepareResult({ copy_text: d.copy_text, status: d.status });
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3 text-[13px]">
      {issue.recommendation && (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">Recommendation</p>
          <p className="text-[var(--pl-text-soft)]">{issue.recommendation}</p>
        </div>
      )}
      {Object.keys(evidence).length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">Evidence</p>
          <div className="space-y-0.5">
            {Object.entries(evidence).slice(0, 8).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-[12px]">
                <span className="w-32 flex-none truncate font-mono text-[var(--pl-text-muted)]">{k}</span>
                <span className="break-all text-[var(--pl-text-soft)]">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {issue.page_id && (
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">Affected URL</p>
          <span className="break-all font-mono text-[12px] text-[var(--pl-text-soft)]">{issue.page_id}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!done && (
          <button
            onClick={resolve}
            disabled={resolving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
          >
            {resolving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Mark resolved
          </button>
        )}
        {done && (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: 'color-mix(in srgb, #22c55e 16%, transparent)', color: '#22c55e' }}>
            <Check size={12} /> Resolved
          </span>
        )}
        {canOneTap && !done && (
          <button
            onClick={prepFix}
            disabled={prepareBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
          >
            {prepareBusy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} style={{ color: ACCENT }} />} Prepare fix
          </button>
        )}
        <span className="text-[11.5px] text-[var(--pl-text-muted)]">Verify: recrawl after fixing.</span>
      </div>

      {prepareResult?.copy_text && (
        <div className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">Suggested fix</p>
          <p className="whitespace-pre-wrap break-words text-[12.5px] text-[var(--pl-text-soft)]">{prepareResult.copy_text}</p>
        </div>
      )}
      {prepareResult?.status === 'approval_required' && (
        <p className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[12.5px] text-[var(--pl-text-soft)]">
          Queued for review in <Link className="font-semibold" style={{ color: ACCENT }} href="/pixie-lab/approvals">Approvals</Link>.
        </p>
      )}
    </div>
  );
}

function IssueRow({ issue, onResolve }: { issue: SeoCrawlIssue; onResolve: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const sev = issue.severity ?? 'info';
  const color = SEV_COLOR[sev] ?? '#64748b';

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge color={color}>{sev}</Badge>
            {issue.category && <Badge color={ACCENT}>{issue.category.replace(/_/g, ' ')}</Badge>}
            {issue.status === 'resolved' && <Badge color="#22c55e">resolved</Badge>}
          </div>
          <p className="mt-1.5 font-display text-[14px] font-bold text-[var(--pl-text)]">{issue.rule_key.replace(/_/g, ' ')}</p>
          {issue.recommendation && (
            <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[var(--pl-text-muted)]">{issue.recommendation}</p>
          )}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-label="Toggle issue detail"
          className="ml-2 flex-none rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)]"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {expanded && <IssueDetail issue={issue} onResolve={onResolve} />}
    </div>
  );
}

const SEVERITIES: Array<SeoSeverity | 'all'> = ['all', 'critical', 'high', 'medium', 'low', 'info'];
const STATUSES: Array<SeoIssueStatus | 'all'> = ['all', 'open', 'resolved', 'ignored'];

export function SeoIssuesPanel({
  initialCrawlJobId,
  initialSiteId,
  initialSeverity,
}: {
  initialCrawlJobId?: string;
  initialSiteId?: string;
  initialSeverity?: string;
}) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [issues, setIssues] = useState<SeoCrawlIssue[]>([]);
  const [severity, setSeverity] = useState<string>(initialSeverity ?? 'all');
  const [issueStatus, setIssueStatus] = useState<string>('open');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const load = useCallback(async () => {
    setStatus('loading');
    const d = await seoApi.listIssues({
      crawl_job_id: initialCrawlJobId,
      site_id: initialSiteId,
      severity: severity !== 'all' ? severity : undefined,
      status: issueStatus !== 'all' ? issueStatus : undefined,
      category: category !== 'all' ? category : undefined,
    });
    if (!d.backendUp) { setStatus('offline'); return; }
    const all = d.issues ?? [];
    setIssues(all);
    // Build category list from results.
    const cats = [...new Set(all.map((i) => i.category).filter(Boolean))] as string[];
    setCategories(cats);
    setStatus('done');
  }, [initialCrawlJobId, initialSiteId, severity, issueStatus, category]);

  useEffect(() => { load(); }, [load]);

  const filtered = issues.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      i.rule_key.toLowerCase().includes(q) ||
      (i.recommendation ?? '').toLowerCase().includes(q) ||
      (i.category ?? '').toLowerCase().includes(q) ||
      (i.page_id ?? '').toLowerCase().includes(q)
    );
  });

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={5} height="h-20" /></div>;
  if (status === 'offline') return <div className="mt-6"><OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>;

  const counts: Record<string, number> = {};
  for (const i of issues) {
    const k = i.severity ?? 'info';
    counts[k] = (counts[k] ?? 0) + 1;
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Severity summary chips */}
      {issues.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {SEVERITIES.filter((s) => s !== 'all').map((s) => {
            const n = counts[s] ?? 0;
            if (!n) return null;
            return (
              <button
                key={s}
                onClick={() => setSeverity(s === severity ? 'all' : s)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition"
                style={severity === s
                  ? { background: `color-mix(in srgb, ${SEV_COLOR[s]} 20%, transparent)`, color: SEV_COLOR[s] }
                  : { background: 'var(--pl-surface-soft)', color: 'var(--pl-text-muted)' }}
              >
                <AlertTriangle size={11} /> {n} {s}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 min-w-[180px] items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2">
          <Search size={14} className="text-[var(--pl-text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issues…"
            className="flex-1 bg-transparent text-[13px] text-[var(--pl-text)] placeholder-[var(--pl-text-muted)] outline-none"
          />
        </div>

        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none"
        >
          {SEVERITIES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All severities' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        <select
          value={issueStatus}
          onChange={(e) => setIssueStatus(e.target.value)}
          className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        {categories.length > 0 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none"
          >
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
        )}

        <button onClick={load} aria-label="Refresh issues" className="rounded-xl border border-[var(--pl-border)] p-2 text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Result count */}
      <p className="text-[12.5px] text-[var(--pl-text-muted)]">
        {filtered.length} issue{filtered.length !== 1 ? 's' : ''}
        {search.trim() ? ` matching "${search}"` : ''}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title={search.trim() ? 'No matching issues' : 'No issues found'}
          body={search.trim() ? 'Try a different search or filter.' : 'Either there are no issues matching the current filters, or this site has a clean bill of health.'}
          action={
            issues.length === 0 ? (
              <Link href={seoRoutes.crawls()} className="rounded-lg px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
                Start a crawl
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => <IssueRow key={i.id} issue={i} onResolve={load} />)}
        </div>
      )}
    </div>
  );
}
