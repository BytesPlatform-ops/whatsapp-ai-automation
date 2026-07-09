'use client';

/**
 * Shared UI kit for the AI Receptionist workspace — theme-aware (--pl-* tokens),
 * consistent with the rest of Pixie Lab. Panels compose these instead of
 * re-styling cards/pills/bars each time.
 */

import React from 'react';

export const RCP_ACCENT = '#E6B45A';

const STATUS_COLOR: Record<string, string> = {
  // generic
  new: '#3b82f6', open: '#3b82f6', pending: '#f59e0b', waiting: '#f59e0b',
  scheduled: '#8b5cf6', in_progress: '#8b5cf6', preparing: '#8b5cf6',
  confirmed: '#22c55e', executed: '#22c55e', link_created: '#22c55e', paid: '#22c55e',
  qualified: '#22c55e', converted: '#16a34a', done: '#22c55e', resolved: '#22c55e', handled: '#22c55e',
  follow_up_needed: '#f59e0b', reviewed: '#8b5cf6', notified: '#8b5cf6',
  cancelled: '#94a3b8', closed: '#94a3b8', lost: '#ef4444', failed: '#ef4444',
  declined: '#ef4444', expired: '#94a3b8', escalated: '#f97316', noop: '#94a3b8',
  // priority
  urgent: '#ef4444', high: '#f97316', normal: '#3b82f6', low: '#64748b', emergency: '#ef4444',
  // sentiment
  positive: '#22c55e', neutral: '#64748b', negative: '#ef4444',
  // integration
  connected: '#22c55e', ready: '#22c55e', active: '#22c55e', mock: '#f59e0b',
  mock_available: '#f59e0b', missing_env: '#94a3b8', missing_connection: '#f97316',
  disabled: '#94a3b8', blocked: '#ef4444',
};

export function statusColor(s?: string): string {
  return STATUS_COLOR[(s || '').toLowerCase()] || '#64748b';
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] ${className}`}>{children}</div>;
}

export function Section({ title, right, children, sub }: { title: string; right?: React.ReactNode; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[1.05rem] font-extrabold tracking-tight text-[var(--pl-text)]">{title}</h2>
          {sub && <p className="text-[12.5px] text-[var(--pl-text-muted)]">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Pill({ children, color = '#64748b', soft = true }: { children: React.ReactNode; color?: string; soft?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={soft ? { background: `color-mix(in srgb, ${color} 16%, transparent)`, color } : { background: color, color: '#fff' }}>
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status?: string }) {
  const s = status || 'unknown';
  return <Pill color={statusColor(s)}>{s.replace(/_/g, ' ')}</Pill>;
}

export function StatCard({ label, value, hint, tone = RCP_ACCENT, onClick }: { label: string; value: React.ReactNode; hint?: string; tone?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4 text-left transition enabled:hover:border-[var(--pl-border-strong)] disabled:cursor-default"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pl-text-muted)]">{label}</p>
      <p className="mt-1 font-display text-[1.7rem] font-extrabold leading-none tracking-tight" style={{ color: tone }}>{value}</p>
      {hint && <p className="mt-1 text-[11.5px] text-[var(--pl-text-muted)]">{hint}</p>}
    </button>
  );
}

/** Horizontal bar breakdown from a { key: count } map. */
export function Breakdown({ data, tone = RCP_ACCENT, empty = 'No data yet' }: { data?: Record<string, number>; tone?: string; empty?: string }) {
  const entries = Object.entries(data || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return <p className="text-[13px] text-[var(--pl-text-muted)]">{empty}</p>;
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-32 shrink-0 truncate text-[12px] capitalize text-[var(--pl-text-muted)]">{k.replace(/_/g, ' ')}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--pl-surface-soft)]">
            <span className="block h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: tone }} />
          </span>
          <span className="w-8 shrink-0 text-right text-[12px] font-semibold text-[var(--pl-text-soft)]">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[14px] text-[var(--pl-text)] placeholder-[var(--pl-text-muted)] outline-none focus:border-[var(--pl-border-strong)]';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className || ''}`} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} resize-y ${props.className || ''}`} />;
}

export function PrimaryButton({ children, tone = RCP_ACCENT, ...rest }: { children: React.ReactNode; tone?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-bold text-[#1a1204] transition disabled:opacity-50 ${rest.className || ''}`} style={{ background: tone }}>
      {children}
    </button>
  );
}

export function GhostButton({ children, ...rest }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50 ${rest.className || ''}`}>
      {children}
    </button>
  );
}

export function fmtDate(s?: string): string {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return s;
  }
}

export function initials(name?: string | null, fallback = '?'): string {
  const n = (name || '').trim();
  if (!n) return fallback;
  const parts = n.split(/\s+/);
  return (((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase().slice(0, 2)) || fallback;
}
