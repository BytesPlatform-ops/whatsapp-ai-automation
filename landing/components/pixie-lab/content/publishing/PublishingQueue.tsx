'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Play, X, RotateCcw, ExternalLink } from 'lucide-react';
import {
  cancelJob, getPublishingConfig, listJobs, retryJob, runWorkerOnce,
  type PublishJob, type PublishStatus, type PublishingConfig,
} from '@/lib/pixie-lab/publishingClient';
import { EmptyState, ErrorNote, GhostButton, Spinner } from '../agent/ui';

const STATUS_LABEL: Record<PublishStatus, { label: string; dot: string }> = {
  draft: { label: 'Draft', dot: '#9aa0a6' },
  scheduled: { label: 'Scheduled', dot: '#3b82f6' },
  queued: { label: 'Queued', dot: '#3b82f6' },
  publishing: { label: 'Publishing', dot: '#d29922' },
  published: { label: 'Published', dot: '#3fb950' },
  failed: { label: 'Failed', dot: '#e5484d' },
  cancelled: { label: 'Cancelled', dot: '#9aa0a6' },
  retry_wait: { label: 'Retry wait', dot: '#d29922' },
  reconnection_required: { label: 'Reconnect', dot: '#e5484d' },
};

const FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Queued', value: 'queued' },
  { label: 'Published', value: 'published' },
  { label: 'Failed', value: 'failed' },
  { label: 'Retry', value: 'retry_wait' },
  { label: 'Cancelled', value: 'cancelled' },
];

const ACTIVE: PublishStatus[] = ['scheduled', 'queued', 'retry_wait'];
const RETRYABLE: PublishStatus[] = ['failed', 'reconnection_required', 'retry_wait'];

/**
 * PublishingQueue — the real publish-job queue (dry-run & live). Filter by status,
 * run the worker once (demo/dry-run), cancel/retry, and open a published permalink.
 * Backed entirely by durable jobs — no fake records.
 */
export function PublishingQueue() {
  const [jobs, setJobs] = useState<Array<{ id: string; job: PublishJob }>>([]);
  const [config, setConfig] = useState<PublishingConfig | null>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listJobs(status ? { status } : {});
    if (!r.ok) { setError(r.error.message); setJobs([]); setLoading(false); return; }
    setError('');
    setJobs(r.data.jobs);
    setLoading(false);
  }, [status]);

  useEffect(() => { getPublishingConfig().then((c) => { if (c.ok) setConfig(c.data); }); }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setBusyId(id); setError('');
    const r = await fn();
    setBusyId('');
    if (!r.ok && r.error) { setError(r.error.message); return; }
    load();
  }

  async function runWorker() {
    setBusyId('__worker__'); setError('');
    const r = await runWorkerOnce();
    setBusyId('');
    if (!r.ok) { setError(r.error.message); return; }
    load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {config && (
          <span className="rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
            style={config.live_allowed ? { borderColor: '#e5484d', color: '#e5484d' } : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-muted)' }}>
            {config.live_allowed ? 'Live enabled' : 'Dry-run only'}
          </span>
        )}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.value} onClick={() => setStatus(f.value)}
              className="rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition"
              style={status === f.value ? { borderColor: 'var(--pl-green)', color: 'var(--pl-green)' } : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-muted)' }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <GhostButton onClick={load}><RefreshCw size={13} /> Refresh</GhostButton>
          <GhostButton onClick={runWorker} disabled={busyId === '__worker__'}><Play size={13} /> Run worker</GhostButton>
        </div>
      </div>

      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

      {loading ? <Spinner label="Loading jobs…" /> : jobs.length === 0 ? (
        <EmptyState title="No publish jobs" body="Publish a saved content item or schedule an approved influencer video to see jobs here." />
      ) : (
        <ul className="space-y-2" role="list">
          {jobs.map(({ id, job }) => {
            const s = STATUS_LABEL[job.status];
            return (
              <li key={id} className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--pl-text)]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} aria-hidden />{s.label}
                  </span>
                  <span className="rounded border border-[var(--pl-border)] px-1.5 py-0.5 text-[10.5px] text-[var(--pl-text-muted)]">{job.platform}</span>
                  <span className="rounded border border-[var(--pl-border)] px-1.5 py-0.5 text-[10.5px] text-[var(--pl-text-muted)]">{job.mode === 'live' ? 'live' : 'dry-run'}</span>
                  <span className="text-[11px] text-[var(--pl-text-muted)]">{job.source_product.replace('_', ' ')}</span>
                  <span className="ml-auto text-[11px] text-[var(--pl-text-muted)]">{fmt(job.scheduled_utc)} · {job.timezone}</span>
                </div>
                <p className="mt-1 line-clamp-1 text-[12.5px] text-[var(--pl-text-soft)]">{String((job.snapshot?.text as string) || '—')}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--pl-text-muted)]">
                  {job.platform_post_id && <span>post {job.platform_post_id}</span>}
                  {job.error_category && <span className="text-amber-500">{job.error_category}</span>}
                  {job.attempt_count > 0 && <span>· {job.attempt_count} attempt{job.attempt_count === 1 ? '' : 's'}</span>}
                  <span className="ml-auto flex gap-1.5">
                    {job.platform_permalink && (
                      <a href={job.platform_permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 font-semibold hover:text-[var(--pl-text)]"><ExternalLink size={11} /> View</a>
                    )}
                    {ACTIVE.includes(job.status) && (
                      <button aria-label="Cancel job" disabled={busyId === id} onClick={() => act(id, () => cancelJob(id))} className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 font-semibold hover:text-[var(--pl-text)] disabled:opacity-50"><X size={11} /> Cancel</button>
                    )}
                    {RETRYABLE.includes(job.status) && (
                      <button aria-label="Retry job" disabled={busyId === id} onClick={() => act(id, () => retryJob(id))} className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 font-semibold hover:text-[var(--pl-text)] disabled:opacity-50"><RotateCcw size={11} /> Retry</button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function fmt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
