'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, RefreshCw, XCircle, RotateCcw, CheckCircle2, AlertTriangle,
  Clock, PlayCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoCrawlJob } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';

const ACCENT = '#14B8A6';
const POLL_MS = 4000;

function statusColor(s: string) {
  if (s === 'completed') return '#22c55e';
  if (s === 'running') return ACCENT;
  if (s === 'failed') return '#ef4444';
  if (s === 'queued') return '#f59e0b';
  if (s === 'cancelled') return '#64748b';
  return '#64748b';
}
function statusIcon(s: string) {
  if (s === 'completed') return CheckCircle2;
  if (s === 'running') return Loader2;
  if (s === 'failed') return AlertTriangle;
  if (s === 'queued') return Clock;
  return XCircle;
}
function statusLabel(s: string) {
  if (s === 'running') return 'Crawling…';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ProgressBar({ job }: { job: SeoCrawlJob }) {
  const discovered = job.discovered_count ?? 0;
  const crawled = job.crawled_count ?? 0;
  const limit = job.requested_limit ?? 0;
  const pct = limit > 0 ? Math.min(100, Math.round((crawled / limit) * 100)) : (job.progress != null ? job.progress : 0);
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11.5px] text-[var(--pl-text-muted)]">
        <span>{crawled} crawled{discovered > 0 ? ` of ~${discovered} discovered` : ''}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--pl-surface-soft)]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: ACCENT }} />
      </div>
    </div>
  );
}

function CrawlRow({ job, onRefresh }: { job: SeoCrawlJob; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [liveJob, setLiveJob] = useState(job);

  // Poll while running/queued.
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async (signal: AbortSignal) => {
    const d = await seoApi.getCrawlJob(job.id);
    if (signal.aborted) return;
    if (d.backendUp && d.job) {
      setLiveJob(d.job);
      if (d.job.status !== 'running' && d.job.status !== 'queued') {
        // Stop polling when terminal.
        if (intervalRef.current) clearInterval(intervalRef.current);
        onRefresh();
      }
    }
  }, [job.id, onRefresh]);

  useEffect(() => {
    if (liveJob.status !== 'running' && liveJob.status !== 'queued') return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    intervalRef.current = setInterval(() => poll(ctrl.signal), POLL_MS);
    return () => {
      ctrl.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [liveJob.status, poll]);

  // Sync prop updates (from parent list refresh) into liveJob.
  useEffect(() => { setLiveJob(job); }, [job]);

  const Icon = statusIcon(liveJob.status);
  const color = statusColor(liveJob.status);

  async function cancel() {
    setBusy(true);
    await seoApi.cancelCrawl(liveJob.id);
    setBusy(false);
    onRefresh();
  }
  async function retry() {
    setBusy(true);
    await seoApi.retryCrawl(liveJob.id);
    setBusy(false);
    onRefresh();
  }

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
          <Icon size={16} className={liveJob.status === 'running' ? 'animate-spin' : undefined} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[14px] font-bold text-[var(--pl-text)]">{liveJob.crawl_type === 'site' ? 'Full site crawl' : 'Single page crawl'}</span>
            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
              {statusLabel(liveJob.status)}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[var(--pl-text-muted)]">
            {liveJob.queued_at ? `Started ${fmtDate(liveJob.queued_at)}` : ''}
            {liveJob.finished_at ? ` · Finished ${fmtDate(liveJob.finished_at)}` : ''}
          </p>
          {(liveJob.status === 'running' || liveJob.status === 'queued') && (
            <div className="mt-2"><ProgressBar job={liveJob} /></div>
          )}
          {liveJob.status === 'completed' && (
            <p className="mt-1 text-[12px] text-[var(--pl-text-muted)]">
              {liveJob.crawled_count ?? 0} pages crawled
              {liveJob.failed_count ? ` · ${liveJob.failed_count} failed` : ''}
            </p>
          )}
        </div>
        {/* Actions */}
        <div className="flex flex-none items-center gap-2">
          {(liveJob.status === 'running' || liveJob.status === 'queued') && (
            <button onClick={cancel} disabled={busy} aria-label="Cancel crawl" className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-red-500 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            </button>
          )}
          {(liveJob.status === 'failed' || liveJob.status === 'cancelled') && (
            <button onClick={retry} disabled={busy} aria-label="Retry crawl" className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)] disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            </button>
          )}
          {liveJob.status === 'completed' && (
            <Link
              href={seoRoutes.issues({ crawl_job_id: liveJob.id })}
              className="rounded-lg border border-[var(--pl-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
            >
              Issues
            </Link>
          )}
          <button onClick={() => setExpanded((e) => !e)} aria-label="Toggle details" className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)]">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-1.5 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3 text-[12.5px]">
          <Row label="Job ID" value={liveJob.id} mono />
          <Row label="Site ID" value={liveJob.site_id} mono />
          <Row label="Requested limit" value={liveJob.requested_limit != null ? String(liveJob.requested_limit) : '—'} />
          <Row label="Discovered" value={liveJob.discovered_count != null ? String(liveJob.discovered_count) : '—'} />
          <Row label="Crawled" value={liveJob.crawled_count != null ? String(liveJob.crawled_count) : '—'} />
          <Row label="Failed pages" value={liveJob.failed_count != null ? String(liveJob.failed_count) : '—'} />
          {liveJob.error_category && <Row label="Error" value={liveJob.error_category} />}
          {liveJob.retry_count != null && <Row label="Retries" value={String(liveJob.retry_count)} />}
          {liveJob.status === 'completed' && (
            <div className="pt-1">
              <Link href={seoRoutes.pages({ crawl_job_id: liveJob.id })} className="text-[12px] font-semibold" style={{ color: ACCENT }}>
                View crawled pages →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-32 flex-none text-[var(--pl-text-muted)]">{label}</span>
      <span className={`break-all text-[var(--pl-text-soft)] ${mono ? 'font-mono text-[11.5px]' : ''}`}>{value}</span>
    </div>
  );
}

export function SeoCrawlsPanel({ initialSiteId }: { initialSiteId?: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [jobs, setJobs] = useState<SeoCrawlJob[]>([]);
  const [siteId] = useState(initialSiteId);

  const load = useCallback(async () => {
    const d = await seoApi.listCrawls(siteId);
    if (!d.backendUp) { setStatus('offline'); return; }
    setJobs(d.jobs ?? []);
    setStatus('done');
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={4} height="h-24" /></div>;
  if (status === 'offline') return <div className="mt-6"><OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>;

  if (!jobs.length) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No crawl jobs yet"
          body="Start a crawl from the Sites page, or run a single-URL audit from the New Audit page."
          action={
            <div className="flex items-center gap-3">
              <Link href={seoRoutes.sites()} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Sites</Link>
              <Link href={seoRoutes.audit()} className="rounded-lg px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>New Audit</Link>
            </div>
          }
        />
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued');

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--pl-text-muted)]">
          {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          {activeJobs.length > 0 && ` · ${activeJobs.length} active`}
        </p>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="space-y-3">
        {jobs.map((j) => <CrawlRow key={j.id} job={j} onRefresh={load} />)}
      </div>
    </div>
  );
}
