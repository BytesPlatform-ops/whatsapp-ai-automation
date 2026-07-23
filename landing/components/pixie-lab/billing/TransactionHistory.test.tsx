import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getLedger = vi.fn();
vi.mock('@/lib/pixie-lab/billingClient', () => ({
  getLedger: (...a: unknown[]) => getLedger(...a),
  mcToCredits: (mc: number) => {
    const n = mc / 1000;
    return String(n);
  },
  formatCredits: (mc: number) => String(mc / 1000),
}));

import { TransactionHistory } from './TransactionHistory';

function makeEntry(id: string, overrides = {}) {
  return {
    id,
    entry_type: 'grant',
    amount_mc: 1000,
    reserved_delta_mc: 0,
    reason_code: 'monthly_grant',
    reference_type: 'subscription',
    reference_id: `sub_${id}`,
    created_at: '2026-07-01T00:00:00Z',
    reservation_id: null,
    original_txn_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  getLedger.mockResolvedValue({
    ok: true,
    data: {
      total: 2,
      limit: 20,
      offset: 0,
      entries: [makeEntry('t1'), makeEntry('t2', { entry_type: 'consume', amount_mc: -500, reason_code: 'content_gen' })],
    },
  });
});

describe('TransactionHistory', () => {
  it('renders ledger entries', async () => {
    render(<TransactionHistory />);
    expect(await screen.findByText('Credits granted')).toBeInTheDocument();
    expect(screen.getByText('Credits used')).toBeInTheDocument();
  });

  it('shows humanized entry types', async () => {
    getLedger.mockResolvedValue({
      ok: true,
      data: {
        total: 1,
        limit: 20,
        offset: 0,
        entries: [makeEntry('t3', { entry_type: 'refund' })],
      },
    });
    render(<TransactionHistory />);
    expect(await screen.findByText('Credits refunded')).toBeInTheDocument();
  });

  it('shows a "No transactions yet" message when entries are empty', async () => {
    getLedger.mockResolvedValue({ ok: true, data: { total: 0, limit: 20, offset: 0, entries: [] } });
    render(<TransactionHistory />);
    expect(await screen.findByText(/No transactions yet/i)).toBeInTheDocument();
  });

  it('shows an error when the request fails', async () => {
    getLedger.mockResolvedValue({ ok: false, error: { kind: 'offline', status: 0, message: 'Billing offline' } });
    render(<TransactionHistory />);
    expect(await screen.findByText(/Billing offline/i)).toBeInTheDocument();
  });

  it('shows total count', async () => {
    render(<TransactionHistory />);
    expect(await screen.findByText(/2 total/i)).toBeInTheDocument();
  });

  it('shows reason codes', async () => {
    render(<TransactionHistory />);
    expect(await screen.findByText('monthly_grant')).toBeInTheDocument();
  });

  it('does NOT render raw metadata from entries', async () => {
    const entryWithMetadata = makeEntry('t4', {
      // metadata field should never appear in the DOM
      metadata: { internal_secret: 'should_not_render', model_key: 'gpt-4o' },
    });
    getLedger.mockResolvedValue({
      ok: true,
      data: { total: 1, limit: 20, offset: 0, entries: [entryWithMetadata] },
    });
    render(<TransactionHistory />);
    await screen.findByText('Credits granted');
    expect(screen.queryByText('internal_secret')).not.toBeInTheDocument();
    expect(screen.queryByText('should_not_render')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();
  });

  it('shows reservation indicator for entries with reservation_id', async () => {
    getLedger.mockResolvedValue({
      ok: true,
      data: {
        total: 1,
        limit: 20,
        offset: 0,
        entries: [makeEntry('t5', { entry_type: 'release', reservation_id: 'rsv_abc', amount_mc: 500 })],
      },
    });
    render(<TransactionHistory />);
    await screen.findByText('Reservation released');
    expect(screen.getByText('reservation')).toBeInTheDocument();
  });

  it('shows refund indicator for entries with original_txn_id', async () => {
    getLedger.mockResolvedValue({
      ok: true,
      data: {
        total: 1,
        limit: 20,
        offset: 0,
        entries: [makeEntry('t6', { entry_type: 'refund', original_txn_id: 'txn_orig', amount_mc: 500 })],
      },
    });
    render(<TransactionHistory />);
    await screen.findByText('Credits refunded');
    expect(screen.getByText('refund/release')).toBeInTheDocument();
  });

  it('renders pagination when total > page size', async () => {
    // Return 25 entries total but only first page
    const entries = Array.from({ length: 20 }, (_, i) => makeEntry(`pg${i}`));
    getLedger.mockResolvedValue({
      ok: true,
      data: { total: 25, limit: 20, offset: 0, entries },
    });
    render(<TransactionHistory />);
    await screen.findByText(/Page 1 of 2/i);
    expect(screen.getByRole('button', { name: /Next page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous page/i })).toBeDisabled();
  });

  it('navigates to next page on Next click', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeEntry(`p1e${i}`));
    const page2 = [makeEntry('p2e0', { entry_type: 'purchase' })];

    getLedger
      .mockResolvedValueOnce({ ok: true, data: { total: 21, limit: 20, offset: 0, entries: page1 } })
      .mockResolvedValueOnce({ ok: true, data: { total: 21, limit: 20, offset: 20, entries: page2 } });

    render(<TransactionHistory />);
    await screen.findByText(/Page 1 of 2/i);
    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));

    await waitFor(() => expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument());
    expect(await screen.findByText('Credits purchased')).toBeInTheDocument();
  });
});
