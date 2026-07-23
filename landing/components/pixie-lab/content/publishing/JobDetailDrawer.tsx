'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ExternalLink, RotateCcw, XCircle, Calendar, AlertTriangle } from 'lucide-react';
import {
  getJob, getAttempts, cancelJob, retryJob, rescheduleJob,
  type PublishJob,
} from '@/lib/pixie-lab/publishingClient';
import { statusMeta, formatDateTime, isSimulatedPostId, platformLabel } from '@/lib/pixie-lab/publishingFormat';
import { contentRoutes } from '@/lib/pixie-lab/contentRoutes';
import { Spinner, ErrorNote, GhostButton } from '../agent/ui';

// ── types ─────────────────────────────────────────────────────────────────────

interface PublishAttempt {
  attempt_number: number;
  started_at: string;
  completed_at: string;
  result: string;
  simulated: boolean;
  platform_post_id: string;
  platform_request_id: string;
  error_category: string;
  error_correlation_id: string;
  retryable: boolean;
  response_meta: Record<string, unknown> | null;
}

function isAttempt(v: unknown): v is { id: string; attempt: PublishAttempt } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'attempt' in v &&
    typeof (v as Record<string, unknown>).attempt === 'object'
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-[var(--pl-text-muted)]">{label}</span>
      <span className="text-[12.5px] text-[var(--pl-text)]">{children || '—'}</span>
    </div>
  );
}

function SafeBadge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const styles: Record<string, string> = {
    ok: 'border-green-500/40 text-green-600 dark:text-green-400',
    warn: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
    danger: 'border-red-500/40 text-red-600 dark:text-red-400',
    neutral: 'border-[var(--pl-border)] text-[var(--pl-text-muted)]',
  };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-semibold ${styles[tone]}`}>
      {children}
    </span>
  );
}

function SourceLink({ job }: { job: PublishJob }) {
  const snap = job.snapshot;
  if (job.source_product === 'ai_influencer') {
    return (
      <a
        href={contentRoutes.influencer()}
        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--pl-green)] hover:underline"
      >
        <ExternalLink size={11} aria-hidden /> Open in AI Influencer
      </a>
    );
  }
  if (snap?.document_id) {
    // Open the source in the Generated Content library (was Overview).
    return (
      <a
        href={contentRoutes.generated({ doc: String(snap.document_id) })}
        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--pl-green)] hover:underline"
      >
        <ExternalLink size={11} aria-hidden /> Open source document
      </a>
    );
  }
  return null;
}

function ExpandableText({ text, limit = 200 }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span className="text-[12.5px] text-[var(--pl-text-muted)]">—</span>;
  if (text.length <= limit) return <span className="text-[12.5px] text-[var(--pl-text)]">{text}</span>;
  return (
    <span className="text-[12.5px] text-[var(--pl-text)]">
      {expanded ? text : `${text.slice(0, limit)}…`}{' '}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="font-semibold text-[var(--pl-green)] hover:underline"
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </span>
  );
}

// ── attempts timeline ──────────────────────────────────────────────────────────

function AttemptsTimeline({ attempts }: { attempts: Array<{ id: string; attempt: PublishAttempt }> }) {
  if (attempts.length === 0) {
    return <p className="text-[12.5px] text-[var(--pl-text-muted)]">No attempts recorded yet.</p>;
  }

  return (
    <ol className="relative flex flex-col gap-3 border-l border-[var(--pl-border)] pl-4">
      {attempts.map(({ id, attempt: a }) => {
        const isOk = a.result === 'success' || a.result === 'published';
        const isFail = a.result === 'failed' || a.result === 'error';
        return (
          <li key={id} className="relative">
            <span
              className={[
                'absolute -left-[1.1rem] top-1 h-3 w-3 rounded-full border-2',
                isOk ? 'border-green-500 bg-green-500/20' : isFail ? 'border-red-500 bg-red-500/20' : 'border-[var(--pl-border)] bg-[var(--pl-surface-soft)]',
              ].join(' ')}
              aria-hidden
            />
            <div className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-bold text-[var(--pl-text)]">Attempt {a.attempt_number}</span>
                {a.result && (
                  <SafeBadge tone={isOk ? 'ok' : isFail ? 'danger' : 'neutral'}>
                    {a.result}
                  </SafeBadge>
                )}
                {a.simulated && <SafeBadge tone="neutral">Simulated</SafeBadge>}
                {a.retryable && <SafeBadge tone="warn">Retryable</SafeBadge>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[var(--pl-text-muted)]">
                {a.started_at && <span>Started: {formatDateTime(a.started_at)}</span>}
                {a.completed_at && <span>Completed: {formatDateTime(a.completed_at)}</span>}
                {a.error_category && <span className="col-span-2 text-amber-500">Error: {a.error_category}</span>}
                {a.platform_request_id && <span className="col-span-2">Request ID: {a.platform_request_id}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── reschedule form ───────────────────────────────────────────────────────────

function RescheduleForm({ jobId, onDone, onCancel }: { jobId: string; onDone: () => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
    setBusy(true);
    setErr('');
    const res = await rescheduleJob(jobId, value, tz);
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-2">
      <label className="text-[11px] font-semibold text-[var(--pl-text-muted)]">
        New date/time (your local timezone: {tz})
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="mt-1 block w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
        />
      </label>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex gap-2">
        <GhostButton type="submit" disabled={busy || !value}>
          {busy ? 'Saving…' : 'Confirm reschedule'}
        </GhostButton>
        <GhostButton type="button" onClick={onCancel}>Cancel</GhostButton>
      </div>
    </form>
  );
}

// ── main drawer ────────────────────────────────────────────────────────────────

export interface JobDetailDrawerProps {
  jobId: string | null;
  onClose: () => void;
}

export function JobDetailDrawer({ jobId, onClose }: JobDetailDrawerProps) {
  const [job, setJob] = useState<PublishJob | null>(null);
  const [attempts, setAttempts] = useState<Array<{ id: string; attempt: PublishAttempt }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);

  // Focus trap
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (jobId) openerRef.current = document.activeElement;
    else openerRef.current = null;
  }, [jobId]);

  useEffect(() => {
    if (!jobId) {
      // return focus to opener on close
      if (openerRef.current && 'focus' in openerRef.current) {
        (openerRef.current as HTMLElement).focus?.();
      }
      return;
    }
    closeRef.current?.focus();
  }, [jobId]);

  // Focus trap keydown
  useEffect(() => {
    if (!jobId) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const el = drawerRef.current;
      if (!el) return;
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((x) => !x.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [jobId, onClose]);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError('');
    setActionErr('');
    setShowReschedule(false);

    const [jobRes, attRes] = await Promise.all([getJob(jobId), getAttempts(jobId)]);
    setLoading(false);

    if (!jobRes.ok) { setError(jobRes.error.message); return; }
    setJob(jobRes.data.job);

    if (attRes.ok) {
      const parsed = (attRes.data.attempts as unknown[]).filter(isAttempt);
      setAttempts(parsed);
    }
  }, [jobId]);

  useEffect(() => { if (jobId) load(); else { setJob(null); setAttempts([]); setError(''); } }, [jobId, load]);

  async function doAction(key: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setActionBusy(key);
    setActionErr('');
    const res = await fn();
    setActionBusy('');
    if (!res.ok && res.error) { setActionErr(res.error.message); return; }
    await load();
  }

  if (!jobId) return null;

  const meta = job ? statusMeta(job.status) : null;
  const snap = job?.snapshot ?? {};
  const simulated = job ? isSimulatedPostId(job.platform_post_id) : false;

  const isActive = meta?.active ?? false;
  const isRetryable = meta?.retryable ?? false;
  const isReconnect = job?.status === 'reconnection_required';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-label="Job details"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-hidden border-l border-[var(--pl-border)] bg-[var(--pl-surface)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--pl-border)] px-5 py-4">
          <h2 className="font-display text-[1rem] font-extrabold tracking-tight text-[var(--pl-text)]">
            Job details
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-lg p-1.5 text-[var(--pl-text-muted)] hover:text-[var(--pl-text)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && <Spinner label="Loading job…" />}
          {error && <ErrorNote>{error}</ErrorNote>}

          {job && meta && (
            <div className="flex flex-col gap-5">
              {/* Status + mode */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--pl-text)]">
                  <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} aria-hidden />
                  {meta.label}
                </span>
                <SafeBadge tone={job.mode === 'live' ? 'danger' : 'neutral'}>
                  {job.mode === 'live' ? 'Live' : 'Dry-run'}
                </SafeBadge>
                {simulated && <SafeBadge tone="neutral">Simulated post ID</SafeBadge>}
              </div>

              {actionErr && <ErrorNote>{actionErr}</ErrorNote>}

              {/* Core fields */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Field label="Platform">{platformLabel(job.platform)}</Field>
                <Field label="Account / Destination">{job.account_id || '—'}</Field>
                <Field label="Source product">{job.source_product.replace('_', ' ')}</Field>
                <Field label="Content format">
                  {typeof snap.content_format === 'string' ? snap.content_format : '—'}
                </Field>
                <Field label="Local schedule">{job.local_time ? formatDateTime(job.local_time) : '—'}</Field>
                <Field label="Timezone">{job.timezone || '—'}</Field>
                <Field label="UTC execution">{job.scheduled_utc ? formatDateTime(job.scheduled_utc) : '—'}</Field>
                <Field label="Attempts">
                  {job.attempt_count} / {job.max_attempts}
                </Field>
                {!!job.next_retry_utc && (
                  <Field label="Next retry">{formatDateTime(job.next_retry_utc)}</Field>
                )}
                {!!job.error_category && (
                  <Field label="Error category">
                    <span className="text-amber-500">{job.error_category}</span>
                  </Field>
                )}
                {!!job.error_correlation_id && (
                  <Field label="Correlation ID">{job.error_correlation_id}</Field>
                )}
                {!!job.platform_post_id && (
                  <Field label="Platform post ID">
                    {job.platform_post_id}
                    {simulated && <span className="ml-1 text-[10px] text-[var(--pl-text-muted)]">(simulated)</span>}
                  </Field>
                )}
                <Field label="Created by">{job.created_by || '—'}</Field>
                {!!job.cancelled_by && <Field label="Cancelled by">{job.cancelled_by}</Field>}
                <Field label="Created at">{formatDateTime(job.created_at)}</Field>
                <Field label="Updated at">{formatDateTime(job.updated_at)}</Field>
              </div>

              {/* Source identifiers */}
              {(!!snap.document_id || !!snap.version_id || !!snap.influencer_video_id || !!snap.influencer_post_id) && (
                <div className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
                  <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.15em] text-[var(--pl-text-muted)]">Source references</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-[var(--pl-text-muted)]">
                    {!!snap.document_id && <span>Doc: {String(snap.document_id)}</span>}
                    {!!snap.version_id && <span>Version: {String(snap.version_id)}</span>}
                    {!!snap.influencer_video_id && <span>Video: {String(snap.influencer_video_id)}</span>}
                    {!!snap.influencer_post_id && <span>Post: {String(snap.influencer_post_id)}</span>}
                  </div>
                </div>
              )}

              {/* Caption snapshot */}
              {!!snap.text && (
                <div>
                  <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.15em] text-[var(--pl-text-muted)]">Caption snapshot</p>
                  <div className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
                    <ExpandableText text={String(snap.text)} />
                  </div>
                </div>
              )}

              {/* Permalink */}
              {job.platform_permalink && (
                <a
                  href={job.platform_permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--pl-green)] hover:underline"
                  aria-label="Open published post on platform"
                >
                  <ExternalLink size={13} aria-hidden />
                  Open platform post
                </a>
              )}

              {/* Source link */}
              <SourceLink job={job} />

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-[var(--pl-border)] pt-4">
                {isActive && (
                  <button
                    type="button"
                    onClick={() => doAction('cancel', () => cancelJob(jobId!))}
                    disabled={!!actionBusy}
                    aria-label="Cancel job"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pl-border)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)] disabled:opacity-50"
                  >
                    <XCircle size={13} aria-hidden />
                    {actionBusy === 'cancel' ? 'Cancelling…' : 'Cancel job'}
                  </button>
                )}

                {isRetryable && !isReconnect && (
                  <button
                    type="button"
                    onClick={() => doAction('retry', () => retryJob(jobId!))}
                    disabled={!!actionBusy}
                    aria-label="Retry job"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pl-border)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)] disabled:opacity-50"
                  >
                    <RotateCcw size={13} aria-hidden />
                    {actionBusy === 'retry' ? 'Retrying…' : 'Retry'}
                  </button>
                )}

                {isActive && !showReschedule && (
                  <button
                    type="button"
                    onClick={() => setShowReschedule(true)}
                    disabled={!!actionBusy}
                    aria-label="Reschedule job"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pl-border)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)] disabled:opacity-50"
                  >
                    <Calendar size={13} aria-hidden />
                    Reschedule
                  </button>
                )}

                {isReconnect && (
                  <a
                    href="/pixie-lab/settings"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pl-border)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)]"
                  >
                    <AlertTriangle size={13} aria-hidden />
                    Go to Settings → Connections
                  </a>
                )}
              </div>

              {showReschedule && (
                <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4">
                  <p className="mb-2 text-[12.5px] font-semibold text-[var(--pl-text)]">Reschedule job</p>
                  <RescheduleForm
                    jobId={jobId!}
                    onDone={async () => { setShowReschedule(false); await load(); }}
                    onCancel={() => setShowReschedule(false)}
                  />
                </div>
              )}

              {/* Attempts timeline */}
              <div>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--pl-text-muted)]">
                  Attempts ({attempts.length})
                </p>
                <AttemptsTimeline attempts={attempts} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
