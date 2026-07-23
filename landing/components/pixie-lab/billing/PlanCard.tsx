'use client';

import { useState } from 'react';
import { AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { postCheckout, postPortal, type BillingStatus } from '@/lib/pixie-lab/billingClient';
import { PrimaryButton, GhostButton } from '@/components/pixie-lab/content/agent/ui';

/** Format an ISO date string to a human-readable "Jan 1, 2026" style. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const STATUS_LABEL: Record<string, { label: string; textColor: string; bgColor: string }> = {
  active: { label: 'Active', textColor: '#16A34A', bgColor: 'rgba(22,163,74,0.12)' },
  trialing: { label: 'Trial', textColor: '#8b5cf6', bgColor: 'rgba(139,92,246,0.12)' },
  past_due: { label: 'Past due', textColor: '#dc2626', bgColor: 'rgba(220,38,38,0.10)' },
  canceled: { label: 'Canceled', textColor: '#6b7280', bgColor: 'rgba(107,114,128,0.12)' },
  incomplete: { label: 'Incomplete', textColor: '#d97706', bgColor: 'rgba(217,119,6,0.12)' },
  unpaid: { label: 'Unpaid', textColor: '#dc2626', bgColor: 'rgba(220,38,38,0.10)' },
};

/**
 * PlanCard — shows the current subscription plan, status badge, renewal date,
 * cancel-at-period-end notice, past-due warning, and Upgrade / Manage billing
 * actions. Handles Stripe-unconfigured gracefully.
 */
export function PlanCard({ status }: { status: BillingStatus }) {
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [stripeUnconfigured, setStripeUnconfigured] = useState(false);

  const subStatus = status.subscription.status;
  const style = STATUS_LABEL[subStatus] ?? {
    label: subStatus,
    textColor: 'var(--pl-text-muted)',
    bgColor: 'var(--pl-surface-soft)',
  };

  async function handleUpgrade() {
    setCheckoutBusy(true);
    setActionError('');
    try {
      const r = await postCheckout(status.plan.id);
      if (!r.ok) {
        // Check for the "Stripe unconfigured" pattern: { backendUp:true, error:… }
        setActionError(r.error.message);
        setStripeUnconfigured(true);
      } else {
        window.location.href = r.data.url;
      }
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function handlePortal() {
    setPortalBusy(true);
    setActionError('');
    try {
      const r = await postPortal();
      if (!r.ok) {
        setActionError(r.error.message);
      } else {
        window.location.href = r.data.url;
      }
    } finally {
      setPortalBusy(false);
    }
  }

  return (
    <section
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 shadow-[var(--pl-shadow-sm)]"
      aria-label="Current plan"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--pl-text-muted)]">
            Current plan
          </p>
          <h2 className="mt-1 font-display text-[1.4rem] font-extrabold tracking-tight text-[var(--pl-text)]">
            {status.plan.name}
          </h2>

          {/* Status badge */}
          <span
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold"
            style={{ color: style.textColor, background: style.bgColor }}
            aria-label={`Subscription status: ${style.label}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: style.textColor }}
              aria-hidden
            />
            {style.label}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <GhostButton
            onClick={handlePortal}
            disabled={portalBusy || stripeUnconfigured}
            title={stripeUnconfigured ? 'Billing portal not available — Stripe is not configured.' : undefined}
            aria-label="Manage billing in Stripe portal"
          >
            <ExternalLink size={13} />
            Manage billing
          </GhostButton>
          <PrimaryButton
            onClick={handleUpgrade}
            busy={checkoutBusy}
            disabled={checkoutBusy || stripeUnconfigured}
            title={stripeUnconfigured ? 'Upgrade not available — Stripe is not configured.' : undefined}
            aria-label="Upgrade plan"
          >
            Upgrade
          </PrimaryButton>
        </div>
      </div>

      {/* Renewal / end date */}
      {status.subscription.current_period_end && (
        <p className="mt-3 text-[13px] text-[var(--pl-text-muted)]">
          {status.subscription.cancel_at_period_end ? 'Cancels on' : 'Renews on'}{' '}
          <strong className="text-[var(--pl-text)]">
            {fmtDate(status.subscription.current_period_end)}
          </strong>
        </p>
      )}

      {/* Cancel-at-period-end notice */}
      {status.subscription.cancel_at_period_end && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-600">
          <Info size={14} className="mt-0.5 flex-none" aria-hidden />
          <span>
            Your plan is set to cancel at the end of the current period. You can reactivate
            it from the billing portal before it expires.
          </span>
        </div>
      )}

      {/* Past-due warning */}
      {status.subscription.past_due && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12.5px] text-red-600"
        >
          <AlertTriangle size={14} className="mt-0.5 flex-none" aria-hidden />
          <span>
            Your subscription has a past-due balance. Please update your payment method to
            restore access.
          </span>
        </div>
      )}

      {/* Stripe unconfigured / action error */}
      {stripeUnconfigured && (
        <p className="mt-2 text-[12px] text-[var(--pl-text-muted)]">
          <Info size={12} className="mr-1 inline" aria-hidden />
          Billing actions are unavailable in the current environment. Contact your administrator.
        </p>
      )}
      {actionError && !stripeUnconfigured && (
        <p role="alert" className="mt-2 text-[12.5px] text-red-500">
          {actionError}
        </p>
      )}
    </section>
  );
}
