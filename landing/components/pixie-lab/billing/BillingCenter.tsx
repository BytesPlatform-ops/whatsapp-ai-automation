'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { useBilling } from '@/lib/pixie-lab/useBilling';
import { GhostButton, Spinner, EmptyState } from '@/components/pixie-lab/content/agent/ui';
import { PlanCard } from './PlanCard';
import { WalletPanel } from './WalletPanel';
import { EntitlementsPanel } from './EntitlementsPanel';
import { UsageMeters } from './UsageMeters';
import { TransactionHistory } from './TransactionHistory';

/**
 * BillingCenter — the top-level Billing Center workspace. Loads config, status,
 * wallet, entitlements and usage in parallel via useBilling. Renders:
 *  - A "preview / enforcement disabled" banner when credit_system_enabled is false
 *  - PlanCard (subscription state + actions)
 *  - WalletPanel + EntitlementsPanel side-by-side on wide viewports
 *  - UsageMeters
 *  - TransactionHistory (self-paginated)
 *
 * Handles loading / error / empty states gracefully.
 */
export function BillingCenter() {
  const { loading, error, config, status, wallet, entitlements, usage, refetch } = useBilling();

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

      {/* Plan card */}
      {status ? (
        <PlanCard status={status} />
      ) : (
        <EmptyState
          title="Subscription not found"
          body="We could not load your subscription details. Please refresh or contact support."
        />
      )}

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
      {usage ? (
        <UsageMeters usage={usage} />
      ) : null}

      {/* Transaction history — self-managing pagination */}
      <TransactionHistory />
    </div>
  );
}
