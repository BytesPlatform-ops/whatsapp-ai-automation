'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  getBillingConfig,
  getBillingStatus,
  getWallet,
  getEntitlements,
  getUsage,
  type BillingConfig,
  type BillingStatus,
  type WalletResponse,
  type EntitlementsResponse,
  type UsageResponse,
} from '@/lib/pixie-lab/billingClient';
import { GhostButton, Spinner } from '@/components/pixie-lab/content/agent/ui';
import { PlanCard } from './PlanCard';
import { WalletPanel } from './WalletPanel';
import { EntitlementsPanel } from './EntitlementsPanel';
import { UsageMeters } from './UsageMeters';
import { TransactionHistory } from './TransactionHistory';
import { AgentBillingSelector } from './AgentBillingSelector';
import { ReceptionistBillingBreakdown } from './ReceptionistBillingBreakdown';
import {
  getImplementedBillingProducts,
  validateBillingProductId,
  getBillingProduct,
  type BillingProductId,
} from '@/lib/pixie-lab/billingProducts';
import { billingRoutes } from '@/lib/pixie-lab/billingRoutes';

/**
 * BillingOverview — the agent-neutral billing page.
 *
 * Workspace plan, subscription status, renewal date, available + reserved credits,
 * total current-period usage, overall transaction history, payment-issue status,
 * Upgrade + Manage-billing actions.
 *
 * An agent selector (All Agents + each registered/implemented product from
 * billingProducts) is driven by the ?agent= query param:
 *  - Selection survives refresh: read via useSearchParams (CSR) so it is URL-driven.
 *  - Browser back/forward works because the param is in the URL.
 *  - Invalid agent value falls back safely to All Agents (null).
 */
export function BillingOverview() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Derive active product from URL (null = All Agents / workspace overview).
  const rawAgent = searchParams.get('agent');
  const activeProduct: BillingProductId | null = validateBillingProductId(rawAgent);

  // Agent-filtered data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError('');

    const filter = activeProduct ? { product: activeProduct } : undefined;

    const results = await Promise.all([
      getBillingConfig(ctrl.signal),
      getBillingStatus(filter, ctrl.signal),
      getWallet(ctrl.signal),
      getEntitlements(filter, ctrl.signal),
      getUsage(filter, ctrl.signal),
    ]).catch((e) => {
      if ((e as Error)?.name === 'AbortError') return null;
      throw e;
    }) ?? [null, null, null, null, null];

    if (ctrl.signal.aborted) return;

    const [configRes, statusRes, walletRes, entRes, usageRes] = results;
    let firstError = '';
    if (configRes) {
      if (!configRes.ok) firstError = firstError || configRes.error.message;
      if (!statusRes?.ok) firstError = firstError || (statusRes?.error.message ?? '');
      if (!walletRes?.ok) firstError = firstError || (walletRes?.error.message ?? '');
      if (!entRes?.ok) firstError = firstError || (entRes?.error.message ?? '');
      if (!usageRes?.ok) firstError = firstError || (usageRes?.error.message ?? '');

      setConfig(configRes.ok ? configRes.data : null);
      setStatus(statusRes?.ok ? statusRes.data : null);
      setWallet(walletRes?.ok ? walletRes.data : null);
      setEntitlements(entRes?.ok ? entRes.data : null);
      setUsage(usageRes?.ok ? usageRes.data : null);
      if (firstError) setError(firstError);
    }

    setLoading(false);
  }, [activeProduct]); // reload when the product filter changes

  useEffect(() => {
    load();
    return () => { abortRef.current?.abort(); };
  }, [load]);

  const refetch = useCallback(() => load(), [load]);

  // Navigate to a different agent view (or back to overview)
  const handleAgentSelect = useCallback(
    (productId: BillingProductId | null) => {
      const url = productId ? billingRoutes.agent(productId) : billingRoutes.overview();
      router.push(url);
    },
    [router],
  );

  const selectedSpec = activeProduct ? getBillingProduct(activeProduct) : null;

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Spinner label="Loading billing information…" />
      </div>
    );
  }

  if (error && !status && !wallet) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <AlertCircle size={32} className="mx-auto mb-3 text-red-500" aria-hidden />
        <p className="font-display text-[1rem] font-bold text-[var(--pl-text)]">
          Unable to load billing information
        </p>
        <p className="mt-1 text-[13px] text-[var(--pl-text-muted)]">{error}</p>
        <div className="mt-5 flex justify-center">
          <GhostButton onClick={refetch} aria-label="Retry loading billing">
            <RefreshCw size={14} />
            Retry
          </GhostButton>
        </div>
      </div>
    );
  }

  const creditDisabled = config ? !config.credit_system_enabled : false;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--pl-text-muted)]">
          Billing &amp; Credits
        </p>
        <h1 className="mt-1 font-display text-[1.35rem] font-extrabold tracking-tight text-[var(--pl-text)]">
          {selectedSpec ? `${selectedSpec.displayName} Billing` : 'Workspace Billing'}
        </h1>
        {selectedSpec && (
          <p className="mt-0.5 text-[13px] text-[var(--pl-text-muted)]">
            Usage and credits for the {selectedSpec.displayName} agent.
          </p>
        )}
      </div>

      {/* Agent selector */}
      <AgentBillingSelector
        products={getImplementedBillingProducts()}
        activeProduct={activeProduct}
        onSelect={handleAgentSelect}
      />

      {/* Preview / enforcement disabled banner */}
      {creditDisabled && (
        <div
          role="status"
          className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-3 text-[13px] text-[var(--pl-text-muted)]"
        >
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-400 align-middle" aria-hidden />
          <strong className="text-[var(--pl-text-soft)]">Billing is in preview</strong>
          {' — '}enforcement is disabled. Credit usage is tracked but not enforced.
        </div>
      )}

      {/* Partial-load error note */}
      {error && (status || wallet) && (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-500"
        >
          Some billing data failed to load: {error}
        </p>
      )}

      {/* Per-agent access notice (when a product is selected) */}
      {selectedSpec && entitlements && (
        <AgentAccessBanner spec={selectedSpec} entitlements={entitlements} />
      )}

      {/* Plan card — always workspace-level */}
      {status ? (
        <PlanCard status={status} />
      ) : null}

      {/* Wallet + Entitlements — side by side on md+ */}
      <div className="grid gap-6 md:grid-cols-2">
        {wallet ? (
          <WalletPanel wallet={wallet} />
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 text-center text-[13px] text-[var(--pl-text-muted)]">
            Wallet data unavailable.
          </div>
        )}

        {entitlements ? (
          <EntitlementsPanel entitlements={entitlements} />
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 text-center text-[13px] text-[var(--pl-text-muted)]">
            Entitlements data unavailable.
          </div>
        )}
      </div>

      {/* Usage meters */}
      {usage ? <UsageMeters usage={usage} /> : null}

      {/* AI Receptionist provider breakdown — only when that agent is selected */}
      {activeProduct === 'ai_receptionist' ? <ReceptionistBillingBreakdown /> : null}

      {/* Transaction history — filtered by product when a product is selected */}
      <TransactionHistory product={activeProduct ?? undefined} />
    </div>
  );
}

// ── AgentAccessBanner ─────────────────────────────────────────────────────────────

import type { BillingProductSpec } from '@/lib/pixie-lab/billingProducts';
import { Check, Lock } from 'lucide-react';

function AgentAccessBanner({
  spec,
  entitlements,
}: {
  spec: BillingProductSpec;
  entitlements: EntitlementsResponse;
}) {
  // product_access is set by the backend when a product filter is active
  const backendAccess = (entitlements as EntitlementsResponse & { product_access?: boolean | null }).product_access;
  // Fallback: check the access map with the entitlement key
  const accessFromPlan = spec.entitlementKey ? entitlements.access[spec.entitlementKey] : undefined;
  const hasAccess = backendAccess != null ? backendAccess : accessFromPlan;

  if (hasAccess == null) return null; // no dedicated flag — don't render a misleading banner

  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-3 text-[13px]"
      style={{
        borderColor: hasAccess ? 'var(--pl-green)' : 'var(--pl-border)',
        background: hasAccess ? 'var(--pl-green-soft)' : 'var(--pl-surface-soft)',
      }}
    >
      <span
        className="grid h-6 w-6 flex-none place-items-center rounded-full"
        style={{
          background: hasAccess ? 'var(--pl-green)' : 'transparent',
          border: hasAccess ? 'none' : '1px solid var(--pl-border)',
        }}
        aria-hidden
      >
        {hasAccess ? (
          <Check size={12} className="text-white" strokeWidth={3} />
        ) : (
          <Lock size={11} style={{ color: 'var(--pl-text-muted)' }} />
        )}
      </span>
      <span style={{ color: hasAccess ? 'var(--pl-text)' : 'var(--pl-text-muted)' }}>
        {hasAccess ? (
          <>
            <strong className="text-[var(--pl-text)]">{spec.displayName}</strong> is{' '}
            <span style={{ color: 'var(--pl-green)', fontWeight: 600 }}>included</span> in your
            plan.
          </>
        ) : (
          <>
            <strong>{spec.displayName}</strong> is not included in your current plan.{' '}
            <a
              href={billingRoutes.upgrade(spec.productId)}
              className="font-semibold underline"
              style={{ color: 'var(--pl-text)' }}
            >
              Upgrade
            </a>{' '}
            to unlock it.
          </>
        )}
      </span>
    </div>
  );
}
