'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, MinusCircle, Stethoscope } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaDiagnostics, MetaCheckStatus } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#EC4899';

const STATUS_COLOR: Record<MetaCheckStatus, string> = {
  ok: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  skipped: '#94a3b8',
};

function StatusIcon({ status }: { status: MetaCheckStatus }) {
  const color = STATUS_COLOR[status];
  if (status === 'ok') return <CheckCircle2 size={16} style={{ color }} className="mt-0.5 flex-none" />;
  if (status === 'warning') return <AlertTriangle size={16} style={{ color }} className="mt-0.5 flex-none" />;
  if (status === 'error') return <XCircle size={16} style={{ color }} className="mt-0.5 flex-none" />;
  return <MinusCircle size={16} style={{ color }} className="mt-0.5 flex-none" />;
}

const OVERALL_LABEL: Record<string, string> = {
  ok: 'Everything looks good',
  warning: 'Connected — a few things to review',
  error: 'Action needed to finish setup',
  disconnected: 'Not connected',
};

/**
 * MetaDiagnosticsPanel — runs the read-only /api/meta/diagnostics health check and
 * renders each probe (connected / Page / Instagram / ad account / campaigns /
 * insights / permissions) with a client-friendly "how to fix it in Meta Business
 * Suite" note. Auto-runs on mount; re-runnable. Shown once Meta is connected.
 */
export function MetaDiagnosticsPanel() {
  const [data, setData] = useState<(MetaDiagnostics & { backendUp?: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    setLoading(true);
    const d = await metaApi.diagnostics();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => { void run(); }, [run]);

  const overall = data?.overall || (data?.backendUp === false ? 'error' : 'ok');
  const overallColor = overall === 'ok' ? '#22c55e' : overall === 'warning' ? '#f59e0b' : '#ef4444';
  const box = 'rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5';

  return (
    <div className={`mt-4 ${box}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-[var(--pl-border)]" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
            <Stethoscope size={16} />
          </span>
          <div>
            <h3 className="font-display text-[14px] font-bold text-[var(--pl-text)]">Connection diagnostics</h3>
            {data && !loading && (
              <p className="text-[12px] font-semibold" style={{ color: overallColor }}>
                {OVERALL_LABEL[overall] || 'Checked'}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => void run()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Re-run
        </button>
      </div>

      {loading && !data ? (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-[var(--pl-text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Running checks…
        </div>
      ) : data?.backendUp === false ? (
        <p className="mt-4 text-[13px] text-[var(--pl-text-muted)]">The marketing service is offline — start the backend and re-run.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {(data?.checks || []).map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <StatusIcon status={c.status} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--pl-text)]">{c.label}</p>
                <p className="text-[12.5px] text-[var(--pl-text-muted)]">{c.detail}</p>
                {c.remediation && c.status !== 'ok' && (
                  <p className="mt-1 rounded-lg bg-[var(--pl-surface-soft)] px-2.5 py-1.5 text-[12px] text-[var(--pl-text-soft)]">
                    <span className="font-semibold" style={{ color: STATUS_COLOR[c.status] }}>Fix: </span>
                    {c.remediation}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
