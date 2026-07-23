'use client';

import { Beaker, Zap } from 'lucide-react';
import { mcToCredits, type EstimateResponse } from '@/lib/pixie-lab/billingClient';

interface CreditEstimateBadgeProps {
  /** The response from POST /api/billing/estimate */
  estimate: EstimateResponse;
}

/**
 * CreditEstimateBadge — inline estimate display for product confirmation dialogs.
 * Shows: estimated credits, max reservation, current balance, estimated remaining,
 * mock/BYOK badges, and a dry-run note when mock. Never says "charged".
 */
export function CreditEstimateBadge({ estimate }: CreditEstimateBadgeProps) {
  const estimatedCredits = mcToCredits(estimate.estimated_credits_mc);
  const maxReservation = mcToCredits(estimate.max_reservation_mc);
  const available = mcToCredits(estimate.available_mc);
  const remaining = mcToCredits(Math.max(0, estimate.available_mc - estimate.estimated_credits_mc));

  return (
    <div
      className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-3.5"
      aria-label="Credit estimate"
    >
      {/* Badges row */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {estimate.mock && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pl-border)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">
            <Beaker size={10} aria-hidden />
            Dry-run
          </span>
        )}
        {estimate.byok && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
            style={{ borderColor: '#8b5cf6', color: '#8b5cf6' }}
          >
            <Zap size={10} aria-hidden />
            BYOK
          </span>
        )}
        {!estimate.credit_system_enabled && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--pl-border)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">
            Credits disabled
          </span>
        )}
      </div>

      {/* Credit rows */}
      <div className="space-y-1.5 text-[13px]">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--pl-text-soft)]">Estimated</span>
          <span className="font-display font-bold tabular-nums text-[var(--pl-text)]">
            {estimatedCredits} credits
          </span>
        </div>

        {estimate.max_reservation_mc !== estimate.estimated_credits_mc && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--pl-text-muted)]">Max reservation</span>
            <span className="font-display font-semibold tabular-nums text-[var(--pl-text-muted)]">
              {maxReservation}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--pl-text-muted)]">Current balance</span>
          <span className="font-display font-semibold tabular-nums text-[var(--pl-text-muted)]">
            {available}
          </span>
        </div>

        <div
          className="flex items-center justify-between gap-4 pt-1.5 border-t border-[var(--pl-border)]"
        >
          <span
            className="text-[var(--pl-text-soft)]"
            style={{ color: estimate.sufficient ? undefined : '#dc2626' }}
          >
            {estimate.sufficient ? 'Balance after' : 'Insufficient balance'}
          </span>
          <span
            className="font-display font-bold tabular-nums"
            style={{ color: estimate.sufficient ? 'var(--pl-green)' : '#dc2626' }}
          >
            {estimate.sufficient ? remaining : '—'}
          </span>
        </div>
      </div>

      {/* Dry-run note */}
      {estimate.mock && (
        <p className="mt-3 text-[11.5px] text-[var(--pl-text-muted)] border-t border-[var(--pl-border)] pt-2">
          Dry-run mode — no credits will be consumed.
        </p>
      )}

      {/* Enforcement disabled note */}
      {!estimate.enforcement_enabled && (
        <p className="mt-2 text-[11.5px] text-[var(--pl-text-muted)]">
          Credit enforcement is currently disabled.
        </p>
      )}
    </div>
  );
}
