'use client';

import { Check, Lock } from 'lucide-react';
import type { EntitlementsResponse } from '@/lib/pixie-lab/billingClient';

/** Human-readable labels for known access keys. Unknown keys get title-cased. */
const ACCESS_LABELS: Record<string, string> = {
  content_agent: 'Content Agent',
  ai_influencer: 'AI Influencer',
  video: 'Video generation',
  live_publishing: 'Live publishing',
  premium_models: 'Premium models',
  receptionist: 'Receptionist',
  seo: 'SEO tools',
  marketing: 'Marketing suite',
  approvals: 'Approvals',
  team_members: 'Team members',
  api_access: 'API access',
};

/** Human-readable labels for known limit keys. */
const LIMIT_LABELS: Record<string, string> = {
  connected_accounts: 'Connected social accounts',
  scheduled_jobs: 'Scheduled jobs',
  variations: 'Content variations per run',
  team_size: 'Team size',
  monthly_credits: 'Monthly credits',
  api_requests: 'API requests / day',
};

function titleCase(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLimit(n: number): string {
  return n === -1 ? 'Unlimited' : n.toLocaleString('en-US');
}

interface FeatureFlagProps {
  label: string;
  enabled: boolean;
}

function FeatureFlag({ label, enabled }: FeatureFlagProps) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2.5"
      aria-label={`${label}: ${enabled ? 'included' : 'not included'}`}
    >
      <span
        className="grid h-5 w-5 flex-none place-items-center rounded-full"
        style={{
          background: enabled ? 'var(--pl-green-soft)' : 'var(--pl-surface)',
          border: enabled ? 'none' : '1px solid var(--pl-border)',
        }}
        aria-hidden
      >
        {enabled ? (
          <Check size={11} style={{ color: 'var(--pl-green)' }} strokeWidth={3} />
        ) : (
          <Lock size={10} style={{ color: 'var(--pl-text-muted)' }} />
        )}
      </span>
      <span
        className="text-[13px] font-medium"
        style={{ color: enabled ? 'var(--pl-text)' : 'var(--pl-text-muted)' }}
      >
        {label}
      </span>
    </div>
  );
}

interface LimitRowProps {
  label: string;
  value: string;
  unlimited: boolean;
}

function LimitRow({ label, value, unlimited }: LimitRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-[var(--pl-border)] last:border-0">
      <span className="text-[13px] text-[var(--pl-text-soft)]">{label}</span>
      <span
        className="font-display text-[13.5px] font-bold tabular-nums"
        style={{ color: unlimited ? 'var(--pl-green)' : 'var(--pl-text)' }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * EntitlementsPanel — grid of plan access flags (enabled/locked) plus key
 * numeric limits. Shows human labels for known keys; title-cases unknown ones.
 */
export function EntitlementsPanel({ entitlements }: { entitlements: EntitlementsResponse }) {
  const accessEntries = Object.entries(entitlements.access);
  const limitEntries = Object.entries(entitlements.limits).filter(
    ([key]) => key !== 'monthly_credits', // shown in WalletPanel
  );

  return (
    <section
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 shadow-[var(--pl-shadow-sm)]"
      aria-label="Plan entitlements"
    >
      <div className="mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--pl-text-muted)]">
          Entitlements
        </p>
        <h2 className="mt-1 font-display text-[1.05rem] font-extrabold tracking-tight text-[var(--pl-text)]">
          {entitlements.plan.name} plan
        </h2>
      </div>

      {/* Feature flags grid */}
      {accessEntries.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-[var(--pl-text-muted)]">
            Features
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {accessEntries.map(([key, enabled]) => (
              <FeatureFlag
                key={key}
                label={ACCESS_LABELS[key] ?? titleCase(key)}
                enabled={enabled}
              />
            ))}
          </div>
        </div>
      )}

      {/* Numeric limits */}
      {limitEntries.length > 0 && (
        <div>
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-[var(--pl-text-muted)]">
            Limits
          </p>
          <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-1">
            {limitEntries.map(([key, n]) => {
              const unlimited = n === -1;
              return (
                <LimitRow
                  key={key}
                  label={LIMIT_LABELS[key] ?? titleCase(key)}
                  value={formatLimit(n)}
                  unlimited={unlimited}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
