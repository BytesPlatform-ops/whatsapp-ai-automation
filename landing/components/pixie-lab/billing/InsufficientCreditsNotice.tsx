'use client';

import { useState } from 'react';
import { AlertTriangle, Lock, CreditCard, RefreshCw } from 'lucide-react';
import { postCheckout, postPortal, type BillingErrorCode } from '@/lib/pixie-lab/billingClient';
import { PrimaryButton, GhostButton } from '@/components/pixie-lab/content/agent/ui';

interface ErrorConfig {
  icon: typeof AlertTriangle;
  title: string;
  body: string;
  showUpgrade: boolean;
  showPortal: boolean;
}

const ERROR_CONFIG: Record<BillingErrorCode, ErrorConfig> = {
  insufficient_credits: {
    icon: CreditCard,
    title: 'Not enough credits',
    body: 'Your account does not have enough credits to complete this action. Upgrade your plan or purchase additional credits to continue.',
    showUpgrade: true,
    showPortal: true,
  },
  feature_not_entitled: {
    icon: Lock,
    title: 'Feature not included in your plan',
    body: 'This feature is not available on your current plan. Upgrade to unlock it.',
    showUpgrade: true,
    showPortal: false,
  },
  usage_limit_reached: {
    icon: RefreshCw,
    title: 'Usage limit reached',
    body: 'You have reached the usage limit for this feature in the current billing period. Upgrade your plan to increase your limits, or wait for the next period.',
    showUpgrade: true,
    showPortal: true,
  },
  plan_inactive: {
    icon: AlertTriangle,
    title: 'Plan inactive',
    body: 'Your subscription is no longer active. Please visit the billing portal to reactivate your plan.',
    showUpgrade: false,
    showPortal: true,
  },
  billing_past_due: {
    icon: AlertTriangle,
    title: 'Payment past due',
    body: 'Your account has a past-due payment. Please update your payment method in the billing portal to restore full access.',
    showUpgrade: false,
    showPortal: true,
  },
  payment_required: {
    icon: CreditCard,
    title: 'Payment required',
    body: 'This action requires a valid payment method on file. Please update your billing details to continue.',
    showUpgrade: true,
    showPortal: true,
  },
};

interface InsufficientCreditsNoticeProps {
  /** The structured billing error code. */
  code: BillingErrorCode;
  /** Optional extra context from the backend (available mc, limit, used, etc.). */
  detail?: {
    limit_key?: string;
    limit?: number;
    used?: number;
    available_mc?: number;
    required_mc?: number;
  };
  /** Current plan id — passed to postCheckout. */
  planId?: string;
}

/**
 * InsufficientCreditsNotice — a structured error surface for billing gate errors.
 * Never shows a generic "Something went wrong" — each code has a specific message.
 * Provides Upgrade and Manage billing actions where applicable.
 */
export function InsufficientCreditsNotice({
  code,
  detail,
  planId = '',
}: InsufficientCreditsNoticeProps) {
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const cfg = ERROR_CONFIG[code];
  if (!cfg) return null;

  const { icon: Icon, title, body, showUpgrade, showPortal } = cfg;

  async function handleUpgrade() {
    setCheckoutBusy(true);
    setActionError('');
    try {
      const r = await postCheckout(planId);
      if (!r.ok) {
        setActionError(r.error.message);
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
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl"
          style={{ background: 'rgba(217,119,6,0.12)', color: '#d97706' }}
          aria-hidden
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--pl-text-muted)]">{body}</p>

          {/* Contextual credit detail */}
          {(detail?.available_mc !== undefined || detail?.required_mc !== undefined) && (
            <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-[var(--pl-text-muted)]">
              {detail.available_mc !== undefined && (
                <span>
                  Available:{' '}
                  <strong className="text-[var(--pl-text)]">
                    {(detail.available_mc / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} credits
                  </strong>
                </span>
              )}
              {detail.required_mc !== undefined && (
                <span>
                  Required:{' '}
                  <strong className="text-[var(--pl-text)]">
                    {(detail.required_mc / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} credits
                  </strong>
                </span>
              )}
            </div>
          )}

          {/* Usage detail */}
          {detail?.used !== undefined && detail.limit !== undefined && (
            <p className="mt-1.5 text-[12px] text-[var(--pl-text-muted)]">
              Used{' '}
              <strong className="text-[var(--pl-text)]">
                {detail.used.toLocaleString('en-US')}
              </strong>{' '}
              of{' '}
              <strong className="text-[var(--pl-text)]">
                {detail.limit.toLocaleString('en-US')}
              </strong>
              {detail.limit_key && ` (${detail.limit_key})`}
            </p>
          )}

          {/* Actions */}
          {(showUpgrade || showPortal) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {showUpgrade && (
                <PrimaryButton
                  onClick={handleUpgrade}
                  busy={checkoutBusy}
                  disabled={checkoutBusy}
                  aria-label="Upgrade plan"
                >
                  Upgrade plan
                </PrimaryButton>
              )}
              {showPortal && (
                <GhostButton
                  onClick={handlePortal}
                  disabled={portalBusy}
                  aria-label="Manage billing"
                >
                  Manage billing
                </GhostButton>
              )}
            </div>
          )}

          {actionError && (
            <p className="mt-2 text-[12px] text-red-500">{actionError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
