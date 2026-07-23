'use client';

import { Coins } from 'lucide-react';
import { mcToCredits, formatCredits, type WalletResponse } from '@/lib/pixie-lab/billingClient';

/** Format an ISO date string to a short "Jan 1, 2026" label. */
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

interface StatRowProps {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}

function StatRow({ label, value, accent, muted }: StatRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-[var(--pl-border)] last:border-0">
      <span
        className="text-[13px]"
        style={{ color: muted ? 'var(--pl-text-muted)' : 'var(--pl-text-soft)' }}
      >
        {label}
      </span>
      <span
        className="font-display text-[14px] font-bold tabular-nums"
        style={{ color: accent ? 'var(--pl-green)' : 'var(--pl-text)' }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * WalletPanel — shows the credit wallet summary:
 *  - Available credits (hero)
 *  - Reserved credits (held for in-progress operations)
 *  - Monthly included credits from the plan
 *  - Lifetime stats: purchased, consumed, refunded
 *  - Period dates and next renewal
 */
export function WalletPanel({ wallet: w }: { wallet: WalletResponse }) {
  const availableCredits = formatCredits(w.wallet.available_mc);
  const reservedCredits = mcToCredits(w.wallet.reserved_mc);
  const monthlyIncluded = w.plan.monthly_credits > 0
    ? formatCredits(w.plan.monthly_credits)
    : 'None';

  return (
    <section
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 shadow-[var(--pl-shadow-sm)]"
      aria-label="Credit wallet"
    >
      <div className="flex items-center gap-2.5 mb-5">
        <span
          className="grid h-9 w-9 flex-none place-items-center rounded-xl"
          style={{ background: 'var(--pl-green-soft)', color: 'var(--pl-green)' }}
          aria-hidden
        >
          <Coins size={17} />
        </span>
        <h2 className="font-display text-[1.05rem] font-extrabold tracking-tight text-[var(--pl-text)]">
          Credit Wallet
        </h2>
      </div>

      {/* Hero: available credits */}
      <div className="rounded-xl bg-[var(--pl-surface-soft)] p-4 text-center mb-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--pl-text-muted)] mb-1">
          Available credits
        </p>
        <p
          className="font-display text-[2.8rem] font-extrabold leading-none tabular-nums"
          style={{ color: 'var(--pl-green)' }}
          aria-label={`${availableCredits} credits available`}
        >
          {availableCredits}
        </p>
        {w.wallet.reserved_mc > 0 && (
          <p className="mt-1.5 text-[12px] text-[var(--pl-text-muted)]">
            + {reservedCredits} reserved (held for active operations)
          </p>
        )}
      </div>

      {/* Stats */}
      <div>
        <StatRow
          label={`Included per period (${w.plan.name})`}
          value={monthlyIncluded}
        />
        <StatRow
          label="Lifetime purchased"
          value={formatCredits(w.wallet.lifetime_purchased_mc)}
          muted
        />
        <StatRow
          label="Lifetime consumed"
          value={formatCredits(w.wallet.lifetime_consumed_mc)}
          muted
        />
        <StatRow
          label="Lifetime refunded"
          value={formatCredits(w.wallet.lifetime_refunded_mc)}
          muted
        />
      </div>

      {/* Period */}
      {(w.wallet.period_start || w.wallet.period_end) && (
        <div className="mt-4 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 text-[12.5px] text-[var(--pl-text-muted)]">
          <span className="font-semibold text-[var(--pl-text-soft)]">Billing period: </span>
          {fmtDate(w.wallet.period_start)} &ndash; {fmtDate(w.wallet.period_end)}
        </div>
      )}
    </section>
  );
}
