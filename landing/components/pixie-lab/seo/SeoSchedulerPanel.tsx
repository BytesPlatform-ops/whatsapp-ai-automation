'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw, Play, Pause, RotateCcw, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoSchedulerHealth } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

function MetricRow({ label, value, tone }: { label: string; value: string | number | null | undefined; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--pl-border)] px-4 py-2.5 last:border-0">
      <span className="text-[12.5px] text-[var(--pl-text-muted)]">{label}</span>
      <span className="font-mono text-[12.5px] font-bold" style={{ color: tone ?? 'var(--pl-text)' }}>
        {value == null ? '—' : value}
      </span>
    </div>
  );
}

function JobTypeRow({
  type,
  onPause,
  onResume,
  busy,
}: {
  type: string;
  onPause: () => void;
  onResume: () => void;
  busy: boolean;
}) {
  const [paused, setPaused] = useState(false);

  async function handlePause() {
    setPaused(true);
    onPause();
  }
  async function handleResume() {
    setPaused(false);
    onResume();
  }

  return (
    <div className="flex items-center justify-between border-b border-[var(--pl-border)] px-4 py-2.5 last:border-0">
      <span className="font-mono text-[12.5px] text-[var(--pl-text-soft)]">{type}</span>
      <div className="flex gap-2">
        {!paused ? (
          <button onClick={handlePause} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)] disabled:opacity-60">
            <Pause size={10} /> Pause
          </button>
        ) : (
          <button onClick={handleResume} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)] disabled:opacity-60">
            <Play size={10} /> Resume
          </button>
        )}
      </div>
    </div>
  );
}

export function SeoSchedulerPanel() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [health, setHealth] = useState<SeoSchedulerHealth | null>(null);
  const [ticking, setTicking] = useState(false);
  const [tickDone, setTickDone] = useState(false);
  const [retryJobId, setRetryJobId] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    const env = await seoApi.schedulerHealth();
    if (!env.backendUp) { setStatus('offline'); return; }
    setHealth(env.health ?? null);
    setStatus('done');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleTick() {
    setTicking(true);
    setTickDone(false);
    await seoApi.schedulerTick();
    setTicking(false);
    setTickDone(true);
    load();
  }

  async function handleRetry() {
    if (!retryJobId.trim()) return;
    setRetrying(true);
    await seoApi.schedulerRetryJob(retryJobId.trim());
    setRetrying(false);
    setRetryJobId('');
    load();
  }

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-20" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  const h = health;

  return (
    <div className="mt-6 space-y-5">
      {/* Internal-only notice */}
      <div className="flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-2.5">
        <AlertTriangle size={13} style={{ color: '#f59e0b' }} />
        <p className="text-[12.5px] text-[var(--pl-text-muted)]">This page is for internal admin use. Scheduler actions affect live background jobs.</p>
      </div>

      {/* Status card */}
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--pl-border)]">
          <div className="flex items-center gap-2">
            <Activity size={14} style={{ color: ACCENT }} />
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Scheduler Health</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold"
              style={h?.enabled
                ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                : { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
            >
              {h?.enabled ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
              {h?.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <button onClick={load} className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
        <MetricRow label="Instance ID" value={h?.instance_id} />
        <MetricRow label="Last heartbeat" value={h?.last_heartbeat ? new Date(h.last_heartbeat).toLocaleString() : null} />
        <MetricRow label="Jobs claimed" value={h?.jobs_claimed} />
        <MetricRow label="Jobs completed" value={h?.jobs_completed} tone="#22c55e" />
        <MetricRow label="Jobs failed" value={h?.jobs_failed} tone={h?.jobs_failed ? '#ef4444' : undefined} />
        <MetricRow label="Jobs retried" value={h?.jobs_retried} />
        <MetricRow label="Jobs running now" value={h?.jobs_running} tone={h?.jobs_running ? ACCENT : undefined} />
        <MetricRow label="Oldest due" value={h?.oldest_due ? new Date(h.oldest_due).toLocaleString() : null} />
        <MetricRow label="Quota errors" value={h?.quota_errors} tone={h?.quota_errors ? '#f59e0b' : undefined} />
        <MetricRow label="Stale lock recoveries" value={h?.stale_lock_recoveries} />
      </div>

      {/* Safe actions */}
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Safe Actions</p>

        {/* Run tick */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-[var(--pl-text-soft)]">Manually run one scheduler tick (claims &amp; executes due jobs).</p>
          <button
            onClick={handleTick}
            disabled={ticking}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-[#02120f] disabled:opacity-60"
            style={{ background: ACCENT }}
          >
            {ticking ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {ticking ? 'Running…' : 'Run Tick'}
          </button>
          {tickDone && <span className="text-[12px] font-semibold" style={{ color: '#22c55e' }}><CheckCircle2 size={12} className="inline mr-1" />Tick completed.</span>}
        </div>

        {/* Retry job */}
        <div className="flex flex-wrap items-center gap-2">
          <p className="w-full text-[13px] text-[var(--pl-text-soft)]">Retry a failed job by ID.</p>
          <input
            value={retryJobId}
            onChange={(e) => setRetryJobId(e.target.value)}
            placeholder="job_id…"
            className="flex-1 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-1.5 font-mono text-[12.5px] text-[var(--pl-text)] outline-none placeholder:text-[var(--pl-text-muted)]"
          />
          <button
            onClick={handleRetry}
            disabled={retrying || !retryJobId.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-60"
          >
            {retrying ? <Loader2 size={12} className="animate-spin" style={{ color: ACCENT }} /> : <RotateCcw size={12} style={{ color: ACCENT }} />}
            Retry
          </button>
        </div>
      </div>

      {/* Job types */}
      {h?.job_types && h.job_types.length > 0 && (
        <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] overflow-hidden">
          <div className="border-b border-[var(--pl-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock size={13} style={{ color: ACCENT }} />
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Job Types</p>
            </div>
          </div>
          {h.job_types.map((type) => (
            <JobTypeRow
              key={type}
              type={type}
              busy={actionBusy}
              onPause={async () => { setActionBusy(true); await seoApi.schedulerPauseType(type); setActionBusy(false); }}
              onResume={async () => { setActionBusy(true); await seoApi.schedulerResumeType(type); setActionBusy(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
