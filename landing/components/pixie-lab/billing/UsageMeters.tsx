'use client';

import type { UsageResponse, UsageCounter } from '@/lib/pixie-lab/billingClient';

/** Human-readable labels for known usage counter keys. */
const COUNTER_LABELS: Record<string, string> = {
  content_generations: 'Content generations',
  video_generations: 'Video generations',
  publish_jobs: 'Publish jobs',
  seo_audits: 'SEO audits',
  api_requests: 'API requests',
  variations: 'Variations',
  scheduled_jobs: 'Scheduled jobs',
  connected_accounts: 'Connected accounts',
};

function titleCase(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface MeterProps {
  counter: UsageCounter;
}

function UsageMeter({ counter }: MeterProps) {
  const label = COUNTER_LABELS[counter.key] ?? titleCase(counter.key);
  const unlimited = counter.limit === -1;
  const pct = unlimited ? 0 : counter.limit > 0 ? Math.min(100, (counter.used / counter.limit) * 100) : 0;
  const nearLimit = !unlimited && pct >= 80;
  const atLimit = !unlimited && pct >= 100;

  const barColor = atLimit
    ? '#dc2626'
    : nearLimit
      ? '#d97706'
      : 'var(--pl-green)';

  return (
    <div className="py-3 border-b border-[var(--pl-border)] last:border-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[13px] font-medium text-[var(--pl-text)]">{label}</span>
        <span className="text-[12px] tabular-nums text-[var(--pl-text-muted)]">
          {unlimited ? (
            <span style={{ color: 'var(--pl-green)' }} className="font-semibold">
              Unlimited
            </span>
          ) : (
            <>
              <strong style={{ color: atLimit ? '#dc2626' : nearLimit ? '#d97706' : 'var(--pl-text)' }}>
                {counter.used.toLocaleString('en-US')}
              </strong>
              {' / '}
              {counter.limit.toLocaleString('en-US')}
            </>
          )}
        </span>
      </div>

      {!unlimited && (
        <div
          role="progressbar"
          aria-valuenow={counter.used}
          aria-valuemin={0}
          aria-valuemax={counter.limit}
          aria-label={`${label}: ${counter.used} of ${counter.limit} used`}
          className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--pl-surface-soft)]"
          style={{ border: '1px solid var(--pl-border)' }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
            style={{
              width: `${pct}%`,
              background: barColor,
            }}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}

/**
 * UsageMeters — renders a labelled progress meter for each usage counter. When
 * a limit is -1 (unlimited) no progress bar is shown. Marks the period source.
 */
export function UsageMeters({ usage }: { usage: UsageResponse }) {
  const { period, counters } = usage;

  return (
    <section
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 shadow-[var(--pl-shadow-sm)]"
      aria-label="Usage meters"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[1.05rem] font-extrabold tracking-tight text-[var(--pl-text)]">
          Usage
        </h2>
        <span className="rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--pl-text-muted)]">
          {period.fallback ? 'Fallback monthly period' : 'Current billing period'}
        </span>
      </div>

      {counters.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-[var(--pl-text-muted)]">
          No usage data for this period.
        </p>
      ) : (
        <div>
          {counters.map((c) => (
            <UsageMeter key={c.key} counter={c} />
          ))}
        </div>
      )}
    </section>
  );
}
