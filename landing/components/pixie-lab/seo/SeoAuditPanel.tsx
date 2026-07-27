'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Loader2, Zap, Copy, Check, Globe, PlayCircle } from 'lucide-react';
import Link from 'next/link';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoAuditResult, SeoIssue } from '@/lib/pixie-lab/serviceTypes';
import { Ring } from './Ring';
import { EmptyState, OfflineState, ErrorState } from '@/components/pixie-lab/services/ServiceStates';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';

const ACCENT = '#14B8A6';

const SEV_COLOR: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6', info: '#64748b' };
const FIXMODE_LABEL: Record<string, string> = { auto_fix: 'One-tap', approval_required: 'Approval', copy_ready: 'Copy-ready', manual_only: 'Manual', unsupported: 'Unsupported' };

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{children}</span>;
}

function IssueRow({ issue, onPrepare, prepared }: { issue: SeoIssue; onPrepare: (i: SeoIssue) => void; prepared?: { copy_text?: string; status?: string } }) {
  const [copied, setCopied] = useState(false);
  const sev = issue.severity || 'info';
  const canCopy = issue.fix_mode === 'copy_ready' || issue.fix_mode === 'auto_fix' || issue.fix_mode === 'approval_required';
  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge color={SEV_COLOR[sev] || '#64748b'}>{sev}</Badge>
            {issue.fix_mode && <Badge color={ACCENT}>{FIXMODE_LABEL[issue.fix_mode] || issue.fix_mode}</Badge>}
            {issue.difficulty && <span className="text-[10.5px] text-[var(--pl-text-muted)]">· {issue.difficulty}</span>}
          </div>
          <p className="mt-1.5 font-display text-[14.5px] font-bold text-[var(--pl-text)]">{issue.issue || issue.one_liner}</p>
          {issue.fix_one_liner && <p className="mt-0.5 text-[13px] text-[var(--pl-text-muted)]">{issue.fix_one_liner}</p>}
        </div>
        {canCopy && (
          <button
            onClick={() => onPrepare(issue)}
            className="flex-none inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            <Zap size={13} style={{ color: ACCENT }} /> Fix
          </button>
        )}
      </div>
      {prepared?.copy_text && (
        <div className="mt-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Suggested fix</span>
            <button
              onClick={() => { navigator.clipboard?.writeText(prepared.copy_text || ''); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
              className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: ACCENT }}
            >
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-[var(--pl-text-soft)]">{prepared.copy_text}</p>
        </div>
      )}
      {prepared?.status === 'approval_required' && (
        <p className="mt-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[12.5px] text-[var(--pl-text-soft)]">
          Queued for your approval — review it in <a className="font-semibold" style={{ color: ACCENT }} href="/pixie-lab/approvals">Approvals</a>.
        </p>
      )}
    </div>
  );
}

/** Multi-page crawl card — shown when a siteId is in scope so the user can kick
 *  off a full-site crawl without leaving the audit page. */
function MultiPageCrawlCard({ siteId }: { siteId: string }) {
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setBusy(true); setErr(null);
    const d = await seoApi.startCrawl({ site_id: siteId, crawl_type: 'site' });
    setBusy(false);
    if (d.backendUp && d.job_id) {
      setStarted(true);
    } else {
      setErr(d.error ?? 'Failed to start crawl. Please try again.');
    }
  }

  if (started) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
          <PlayCircle size={18} />
        </span>
        <div className="flex-1">
          <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">Crawl started</p>
          <p className="text-[12.5px] text-[var(--pl-text-muted)]">Track progress in Crawl Jobs.</p>
        </div>
        <Link href={seoRoutes.crawls({ site_id: siteId })} className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
          View
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Multi-page crawl</p>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--pl-text-soft)]">Start a full-site crawl for deeper analysis — discovers all pages, scores your site, and lists every technical issue.</p>
        <button
          onClick={start}
          disabled={busy}
          className="inline-flex flex-none items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f] disabled:opacity-60"
          style={{ background: ACCENT }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
          {busy ? 'Starting…' : 'Start crawl'}
        </button>
      </div>
      {err && <p className="mt-2 text-[12px] text-amber-500">{err}</p>}
    </div>
  );
}

export function SeoAuditPanel({ initialUrl, auditId, siteId }: { initialUrl?: string; auditId?: string; siteId?: string }) {
  const [url, setUrl] = useState(initialUrl || '');
  const [pagespeed, setPagespeed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'offline'>('idle');
  const [result, setResult] = useState<SeoAuditResult | null>(null);
  const [prepared, setPrepared] = useState<Record<string, { copy_text?: string; status?: string }>>({});
  const [tab, setTab] = useState<'all' | 'quick'>('all');

  const run = useCallback(async (target: string, opts?: { include_pagespeed?: boolean }) => {
    if (!target || target.trim().length < 3) return;
    setStatus('loading'); setResult(null); setPrepared({});
    const d = await seoApi.runAudit(target.trim(), { include_pagespeed: opts?.include_pagespeed ?? pagespeed });
    if (!d.backendUp) { setStatus('offline'); return; }
    if (d.error || !d.audit) { setStatus('error'); return; }
    setResult(d as SeoAuditResult); setStatus('done');
  }, [pagespeed]);

  // Deep-link: load a stored audit by id, or prefill+autorun from a URL.
  useEffect(() => {
    if (auditId) {
      setStatus('loading');
      seoApi.getAudit(auditId).then((d) => {
        if (!d.backendUp) return setStatus('offline');
        if (!d.audit) return setStatus('error');
        setResult({ status: 'ok', audit: d.audit, issues: d.issues || [] }); setStatus('done');
      });
    } else if (initialUrl) {
      run(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditId, initialUrl]);

  async function prepareFix(issue: SeoIssue) {
    if (!result?.audit?.id) return;
    setPrepared((p) => ({ ...p, [issue.id]: { status: 'loading' } }));
    const d = await seoApi.prepareFix(result.audit.id, issue.id);
    setPrepared((p) => ({ ...p, [issue.id]: { copy_text: d.copy_text, status: d.status } }));
  }

  const issues = result?.issues || [];
  const quickWins = issues.filter((i) => (i.fix_mode === 'auto_fix' || i.fix_mode === 'copy_ready') && i.difficulty === 'easy');
  const shown = tab === 'quick' ? quickWins : issues;

  return (
    <div className="mt-6 space-y-5">
      {/* Multi-page crawl shortcut (only shown when a siteId is in context) */}
      {siteId && (
        <MultiPageCrawlCard siteId={siteId} />
      )}

      {/* Single-URL audit card */}
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 shadow-[var(--pl-shadow-sm)]">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Single-URL audit</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 focus-within:border-[var(--pl-border-strong)]">
            <Globe size={16} className="text-[var(--pl-text-muted)]" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') run(url); }}
              placeholder="yourwebsite.com"
              className="flex-1 bg-transparent text-[14.5px] text-[var(--pl-text)] placeholder-[var(--pl-text-muted)] outline-none"
            />
          </div>
          <button
            onClick={() => run(url)}
            disabled={status === 'loading' || url.trim().length < 3}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-[#02120f] transition disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {status === 'loading' ? 'Scanning…' : 'Run audit'}
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-[var(--pl-text-muted)]">
          <input type="checkbox" checked={pagespeed} onChange={(e) => setPagespeed(e.target.checked)} className="accent-[#14B8A6]" />
          Include PageSpeed performance check (slower)
        </label>
      </div>

      {/* results */}
      <div className="mt-5">

        {status === 'idle' && (
          <EmptyState title="Audit any website" body="Enter a URL to get a platform-aware technical SEO audit — score, issues, and one-tap fixes." />
        )}
        {status === 'loading' && !result && (
          <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-6 py-14 text-center">
            <Loader2 size={26} className="mx-auto animate-spin" style={{ color: ACCENT }} />
            <p className="mt-3 font-display font-bold text-[var(--pl-text)]">Crawling and scoring…</p>
            <p className="mt-1 text-[13px] text-[var(--pl-text-muted)]">Detecting the platform and checking technical SEO.</p>
          </div>
        )}
        {status === 'offline' && <OfflineState service="SEO" action={<button onClick={() => run(url)} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />}
        {status === 'error' && <ErrorState title="Couldn't complete the audit" body="The URL may be unreachable or blocked. Check it and try again." action={<button onClick={() => run(url)} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />}

        {status === 'done' && result && (
          <div className="space-y-5">
            {/* score header */}
            <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
              <Ring score={result.audit.score ?? 0} max={result.audit.max_score ?? 100} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-extrabold text-[var(--pl-text)]">{result.audit.final_url || result.audit.website_url}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--pl-text-muted)]">
                  {result.audit.platform && <Badge color={ACCENT}>{result.audit.platform}</Badge>}
                  <span>{issues.length} issue{issues.length === 1 ? '' : 's'} found</span>
                  {quickWins.length > 0 && <span>· {quickWins.length} quick win{quickWins.length === 1 ? '' : 's'}</span>}
                  {result.audit.connected === false && <span>· not connected for auto-fix</span>}
                </div>
                {result.audit.category_scores && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {Object.entries(result.audit.category_scores).slice(0, 6).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-28 truncate text-[12px] capitalize text-[var(--pl-text-muted)]">{k.replace(/_/g, ' ')}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--pl-surface-soft)]">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, Number(v)))}%`, background: ACCENT }} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* issue tabs */}
            <div className="flex items-center gap-2">
              {(['all', 'quick'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition"
                  style={tab === t ? { background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`, color: ACCENT } : { color: 'var(--pl-text-muted)' }}>
                  {t === 'all' ? `All issues (${issues.length})` : `Quick wins (${quickWins.length})`}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <EmptyState title={tab === 'quick' ? 'No quick wins' : 'No issues found'} body={tab === 'quick' ? 'Nothing auto-fixable right now — check the full list.' : 'This page looks clean. Nice work!'} />
            ) : (
              <div className="space-y-3">
                {shown.map((i) => <IssueRow key={i.id} issue={i} onPrepare={prepareFix} prepared={prepared[i.id]} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
