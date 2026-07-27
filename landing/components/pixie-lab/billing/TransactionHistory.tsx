'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CornerDownRight } from 'lucide-react';
import { getLedger, mcToCredits, type LedgerEntry } from '@/lib/pixie-lab/billingClient';
import { GhostButton, Spinner, ErrorNote } from '@/components/pixie-lab/content/agent/ui';

const PAGE_SIZE = 20;

/** Human-readable labels for known ledger entry types. */
const ENTRY_TYPE_LABELS: Record<string, string> = {
  grant: 'Credits granted',
  consume: 'Credits used',
  refund: 'Credits refunded',
  reserve: 'Credits reserved',
  release: 'Reservation released',
  purchase: 'Credits purchased',
  adjustment: 'Manual adjustment',
  expiry: 'Credits expired',
};

function humanizeType(t: string): string {
  return (
    ENTRY_TYPE_LABELS[t] ??
    t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Signed credit display: positive = green "+X", negative = red "-X" */
function AmountCell({ mc }: { mc: number }) {
  const positive = mc >= 0;
  const text = `${positive ? '+' : '−'}${mcToCredits(Math.abs(mc))}`;
  return (
    <span
      className="font-display text-[13px] font-bold tabular-nums"
      style={{ color: positive ? 'var(--pl-green)' : '#dc2626' }}
      aria-label={`${positive ? 'Added' : 'Removed'} ${mcToCredits(Math.abs(mc))} credits`}
    >
      {text}
    </span>
  );
}

function EntryRow({ entry }: { entry: LedgerEntry }) {
  const hasRelationship = entry.original_txn_id || entry.reservation_id;
  return (
    <tr className="border-b border-[var(--pl-border)] last:border-0 hover:bg-[var(--pl-surface-hover)] transition-colors">
      <td className="py-3 pr-4 text-[12.5px] text-[var(--pl-text-muted)] whitespace-nowrap">
        {fmtDate(entry.created_at)}
      </td>
      <td className="py-3 pr-4">
        <span className="text-[13px] font-medium text-[var(--pl-text)]">
          {humanizeType(entry.entry_type)}
        </span>
        {hasRelationship && (
          <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-[var(--pl-text-muted)]">
            <CornerDownRight size={10} aria-hidden />
            {entry.original_txn_id ? 'refund/release' : 'reservation'}
          </span>
        )}
      </td>
      <td className="py-3 pr-4 text-right">
        <AmountCell mc={entry.amount_mc} />
        {entry.reserved_delta_mc !== 0 && (
          <span className="ml-1.5 text-[11px] text-[var(--pl-text-muted)]">
            ({entry.reserved_delta_mc > 0 ? '+' : ''}
            {mcToCredits(entry.reserved_delta_mc)} reserved)
          </span>
        )}
      </td>
      <td className="py-3 pr-4 text-[12px] text-[var(--pl-text-muted)]">
        {entry.reason_code || '—'}
      </td>
      <td className="py-3 text-[12px] text-[var(--pl-text-muted)]">
        {entry.reference_type && entry.reference_id ? (
          <span>
            <span className="font-medium">{entry.reference_type}</span>:{' '}
            <span className="font-mono text-[11px]">
              {entry.reference_id.slice(0, 12)}&hellip;
            </span>
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

interface TransactionHistoryProps {
  /** Optional product filter — only show ledger entries attributed to this product. */
  product?: string;
}

/**
 * TransactionHistory — paginated ledger table. Loads the current page from the
 * /ledger endpoint; prev/next navigate via limit+offset. Shows human-readable
 * entry types, signed credit amounts and reservation relationships.
 * Does NOT render raw metadata fields.
 * When `product` is provided, the ledger endpoint is called with that filter.
 */
export function TransactionHistory({ product }: TransactionHistoryProps = {}) {
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPage = useCallback(async (pageOffset: number) => {
    setLoading(true);
    setError('');
    const r = await getLedger({ limit: PAGE_SIZE, offset: pageOffset, product });
    if (!r.ok) {
      setError(r.error.message);
    } else {
      setEntries(r.data.entries);
      setTotal(r.data.total);
    }
    setLoading(false);
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 0 when the product filter changes
  useEffect(() => { setOffset(0); }, [product]);

  useEffect(() => {
    loadPage(offset);
  }, [loadPage, offset]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <section
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 shadow-[var(--pl-shadow-sm)]"
      aria-label="Transaction history"
    >
      <div className="mb-5 flex items-center justify-between gap-2">
        <h2 className="font-display text-[1.05rem] font-extrabold tracking-tight text-[var(--pl-text)]">
          Transaction history
        </h2>
        {total > 0 && (
          <span className="text-[12px] text-[var(--pl-text-muted)]">
            {total.toLocaleString('en-US')} total
          </span>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && <Spinner label="Loading transactions…" />}

      {!loading && !error && entries.length === 0 && (
        <p className="py-4 text-center text-[13px] text-[var(--pl-text-muted)]">
          No transactions yet.
        </p>
      )}

      {!loading && entries.length > 0 && (
        <>
          <div className="overflow-x-auto -mx-2 px-2">
            <table
              className="w-full min-w-[600px] text-left"
              aria-label="Credit transaction ledger"
            >
              <thead>
                <tr className="border-b border-[var(--pl-border)]">
                  {['Date', 'Type', 'Amount', 'Reason', 'Reference'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="pb-2 pr-4 text-[11px] font-bold uppercase tracking-[0.15em] text-[var(--pl-text-muted)] last:pr-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="mt-5 flex items-center justify-between gap-2">
              <GhostButton
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={!hasPrev}
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
                Prev
              </GhostButton>
              <span className="text-[12.5px] text-[var(--pl-text-muted)]">
                Page {currentPage} of {totalPages}
              </span>
              <GhostButton
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={!hasNext}
                aria-label="Next page"
              >
                Next
                <ChevronRight size={14} />
              </GhostButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}
