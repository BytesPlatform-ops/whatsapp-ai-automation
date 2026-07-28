'use client';

import { useEffect, useState } from 'react';
import { CreditCard, ArrowUpRight, Loader2 } from 'lucide-react';
import { OfflineState, LoadingCards, EmptyState } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

/**
 * SEO billing usage panel. Attempts to load usage data from the billing service.
 * Degrades gracefully if no billing client is wired or the backend is offline.
 */

interface UsageMeter {
  name: string;
  used: number;
  limit: number | null;
  unit?: string;
}

interface UsagePayload {
  plan?: string;
  period_start?: string;
  period_end?: string;
  meters?: UsageMeter[];
}

async function fetchSeoUsage(): Promise<{ ok: boolean; data: UsagePayload | null }> {
  try {
    const r = await fetch('/api/lab/billing/usage?service=seo', { cache: 'no-store' });
    if (!r.ok) return { ok: false, data: null };
    const d = (await r.json().catch(() => null)) as UsagePayload | null;
    return { ok: true, data: d };
  } catch {
    return { ok: false, data: null };
  }
}

function MeterRow({ meter }: { meter: UsageMeter }) {
  const pct = meter.limit != null && meter.limit > 0
    ? Math.min(100, Math.round((meter.used / meter.limit) * 100))
    : null;
  const overLimit = pct != null && pct >= 90;

  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-[var(--pl-border)] last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[var(--pl-text-soft)]">{meter.name}</span>
        <span className="text-[12px] font-bold text-[var(--pl-text)]">
          {meter.used.toLocaleString()} {meter.unit ?? ''}
          {meter.limit != null && (
            <span className="ml-1 text-[var(--pl-text-muted)] font-normal">/ {meter.limit.toLocaleString()}</span>
          )}
        </span>
      </div>
      {pct != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--pl-surface-soft)]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: overLimit ? '#ef4444' : ACCENT }}
          />
        </div>
      )}
    </div>
  );
}

export function SeoBillingUsagePanel() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline' | 'unavailable'>('loading');
  const [usage, setUsage] = useState<UsagePayload | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const result = await fetchSeoUsage();
      if (!alive) return;
      if (!result.ok) {
        // Billing endpoint may not exist yet — show placeholder instead of offline error.
        setStatus('unavailable');
        return;
      }
      setUsage(result.data);
      setStatus('done');
    }
    load();
    return () => { alive = false; };
  }, []);

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-16" /></div>;

  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="Billing" action={<button onClick={() => setStatus('loading')} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  if (status === 'unavailable' || !usage) {
    return (
      <div className="mt-6">
        <EmptyState
          title="Usage data not available"
          body="SEO usage meters will appear here once the billing service is configured and has recorded SEO-attributed usage."
          action={
            <a
              href="/pixie-lab/billing"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
            >
              <CreditCard size={14} style={{ color: ACCENT }} /> Go to Billing <ArrowUpRight size={12} style={{ color: ACCENT }} />
            </a>
          }
        />
      </div>
    );
  }

  const meters = usage.meters ?? [];

  return (
    <div className="mt-6 space-y-5">
      {/* Plan / period header */}
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Current Plan</p>
            <p className="font-display text-[18px] font-extrabold text-[var(--pl-text)]">{usage.plan ?? 'Unknown'}</p>
          </div>
          {usage.period_start && usage.period_end && (
            <p className="text-[12px] text-[var(--pl-text-muted)]">
              {new Date(usage.period_start).toLocaleDateString()} – {new Date(usage.period_end).toLocaleDateString()}
            </p>
          )}
          <a
            href="/pixie-lab/billing"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            <CreditCard size={12} style={{ color: ACCENT }} /> Manage Billing <ArrowUpRight size={12} style={{ color: ACCENT }} />
          </a>
        </div>
      </div>

      {/* Meters */}
      {meters.length === 0 ? (
        <p className="text-[13px] italic text-[var(--pl-text-muted)]">No SEO usage meters recorded for this period.</p>
      ) : (
        <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4">
          <p className="border-b border-[var(--pl-border)] py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">SEO Usage Meters</p>
          {meters.map((m) => <MeterRow key={m.name} meter={m} />)}
        </div>
      )}
    </div>
  );
}
