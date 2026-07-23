import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mcToCredits,
  formatCredits,
  classify,
  getWallet,
  getLedger,
  getBillingConfig,
  postCheckout,
} from './billingClient';

function mockFetchOnce(status: number, body: unknown) {
  const ok = status >= 200 && status < 300;
  (globalThis.fetch as unknown) = vi
    .fn()
    .mockResolvedValueOnce({ ok, status, json: async () => body });
}

afterEach(() => vi.restoreAllMocks());

// ── mcToCredits ───────────────────────────────────────────────────────────────

describe('mcToCredits', () => {
  it('converts exact credits (no decimals)', () => {
    expect(mcToCredits(1000)).toBe('1');
    expect(mcToCredits(5000)).toBe('5');
    expect(mcToCredits(0)).toBe('0');
  });

  it('keeps meaningful decimal places and trims trailing zeros', () => {
    expect(mcToCredits(1500)).toBe('1.5');
    expect(mcToCredits(1050)).toBe('1.05');
    expect(mcToCredits(1001)).toBe('1.001');
    expect(mcToCredits(1010)).toBe('1.01');
  });

  it('handles large values', () => {
    expect(mcToCredits(1_000_000)).toBe('1000');
    expect(mcToCredits(1_500_000)).toBe('1500');
  });

  it('handles sub-credit amounts', () => {
    expect(mcToCredits(1)).toBe('0.001');
    expect(mcToCredits(10)).toBe('0.01');
    expect(mcToCredits(100)).toBe('0.1');
  });
});

// ── formatCredits ─────────────────────────────────────────────────────────────

describe('formatCredits', () => {
  it('formats whole numbers without decimals', () => {
    expect(formatCredits(1000)).toBe('1');
    expect(formatCredits(1_000_000)).toMatch(/1[,.]000/); // locale-dependent separator
  });

  it('formats fractional credits', () => {
    expect(formatCredits(1500)).toBe('1.5');
  });
});

// ── classify ──────────────────────────────────────────────────────────────────

describe('classify', () => {
  it('maps billing error codes to billing_error kind', () => {
    expect(classify(400, 'insufficient_credits')).toBe('billing_error');
    expect(classify(402, 'feature_not_entitled')).toBe('billing_error');
    expect(classify(402, 'usage_limit_reached')).toBe('billing_error');
    expect(classify(402, 'plan_inactive')).toBe('billing_error');
    expect(classify(402, 'billing_past_due')).toBe('billing_error');
    expect(classify(402, 'payment_required')).toBe('billing_error');
  });

  it('maps HTTP status codes to kinds', () => {
    expect(classify(401)).toBe('unauthorized');
    expect(classify(403)).toBe('forbidden');
    expect(classify(404)).toBe('not_found');
    expect(classify(500)).toBe('server');
    expect(classify(503)).toBe('server');
  });

  it('returns unknown for unrecognised codes', () => {
    expect(classify(409)).toBe('unknown');
    expect(classify(422)).toBe('unknown');
  });
});

// ── getWallet ─────────────────────────────────────────────────────────────────

describe('getWallet', () => {
  it('returns ok with wallet and plan data', async () => {
    mockFetchOnce(200, {
      backendUp: true,
      wallet: {
        available_mc: 5000,
        reserved_mc: 0,
        lifetime_granted_mc: 10000,
        lifetime_purchased_mc: 0,
        lifetime_consumed_mc: 5000,
        lifetime_refunded_mc: 0,
        plan_id: 'starter',
        period_start: '2026-07-01T00:00:00Z',
        period_end: '2026-07-31T23:59:59Z',
      },
      plan: {
        id: 'starter',
        name: 'Starter',
        monthly_credits: 10000,
        access: { content_agent: true },
        limits: { connected_accounts: 3 },
      },
    });
    const r = await getWallet();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.wallet.available_mc).toBe(5000);
      expect(r.data.plan.name).toBe('Starter');
      expect(r.data.plan.monthly_credits).toBe(10000);
    }
  });

  it('returns offline error when backendUp is false', async () => {
    mockFetchOnce(200, { backendUp: false, error: 'billing offline' });
    const r = await getWallet();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('offline');
      expect(r.error.message).toContain('offline');
    }
  });

  it('classifies 401 as unauthorized', async () => {
    mockFetchOnce(401, { backendUp: true, error: 'Not signed in' });
    const r = await getWallet();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('unauthorized');
  });

  it('classifies billing_past_due structured error', async () => {
    mockFetchOnce(402, {
      backendUp: true,
      detail: { error: 'billing_past_due', message: 'Your account has a past-due payment.' },
    });
    const r = await getWallet();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('billing_error');
      expect(r.error.code).toBe('billing_past_due');
      expect(r.error.message).toMatch(/past-due/);
    }
  });
});

// ── getLedger ─────────────────────────────────────────────────────────────────

describe('getLedger', () => {
  it('returns ledger entries with correct shape', async () => {
    const entry = {
      id: 'txn_1',
      entry_type: 'grant',
      amount_mc: 10000,
      reserved_delta_mc: 0,
      reason_code: 'monthly_grant',
      reference_type: 'subscription',
      reference_id: 'sub_abc123',
      created_at: '2026-07-01T00:00:00Z',
      reservation_id: null,
      original_txn_id: null,
    };
    mockFetchOnce(200, {
      backendUp: true,
      total: 1,
      limit: 20,
      offset: 0,
      entries: [entry],
    });
    const r = await getLedger({ limit: 20, offset: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total).toBe(1);
      expect(r.data.entries).toHaveLength(1);
      expect(r.data.entries[0].entry_type).toBe('grant');
      expect(r.data.entries[0].amount_mc).toBe(10000);
      expect(r.data.entries[0].reservation_id).toBeNull();
      expect(r.data.entries[0].original_txn_id).toBeNull();
    }
  });

  it('passes limit and offset as query params', async () => {
    const spy = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ backendUp: true, total: 0, limit: 10, offset: 20, entries: [] }),
    });
    (globalThis.fetch as unknown) = spy;
    await getLedger({ limit: 10, offset: 20 });
    const [url] = spy.mock.calls[0];
    expect(String(url)).toContain('limit=10');
    expect(String(url)).toContain('offset=20');
  });

  it('classifies insufficient_credits from structured error body', async () => {
    mockFetchOnce(402, {
      backendUp: true,
      detail: { error: 'insufficient_credits', message: 'Not enough credits.' },
    });
    const r = await getLedger();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('billing_error');
      expect(r.error.code).toBe('insufficient_credits');
    }
  });
});

// ── postCheckout ──────────────────────────────────────────────────────────────

describe('postCheckout', () => {
  it('returns checkout url on success', async () => {
    mockFetchOnce(200, { backendUp: true, url: 'https://checkout.stripe.com/pay/cs_test_abc' });
    const r = await postCheckout('pro');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.url).toContain('stripe.com');
  });

  it('surfaces server error gracefully', async () => {
    mockFetchOnce(500, { backendUp: true, error: 'Stripe not configured' });
    const r = await postCheckout('pro');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('server');
  });
});

// ── getBillingConfig ──────────────────────────────────────────────────────────

describe('getBillingConfig', () => {
  it('returns config fields', async () => {
    mockFetchOnce(200, {
      backendUp: true,
      credit_system_enabled: true,
      billing_enforcement_enabled: false,
      byok_credit_policy: 'no_charge',
      mock_usage_consumes_credits: false,
      reservation_ttl_seconds: 3600,
      reconciliation_enabled: true,
    });
    const r = await getBillingConfig();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.credit_system_enabled).toBe(true);
      expect(r.data.billing_enforcement_enabled).toBe(false);
    }
  });
});
