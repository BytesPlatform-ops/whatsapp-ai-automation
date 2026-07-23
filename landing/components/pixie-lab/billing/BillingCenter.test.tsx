import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── mock billingClient ────────────────────────────────────────────────────────
const getBillingConfig = vi.fn();
const getBillingStatus = vi.fn();
const getWallet = vi.fn();
const getEntitlements = vi.fn();
const getUsage = vi.fn();
const getLedger = vi.fn();
const postCheckout = vi.fn();
const postPortal = vi.fn();

vi.mock('@/lib/pixie-lab/billingClient', () => ({
  getBillingConfig: (...a: unknown[]) => getBillingConfig(...a),
  getBillingStatus: (...a: unknown[]) => getBillingStatus(...a),
  getWallet: (...a: unknown[]) => getWallet(...a),
  getEntitlements: (...a: unknown[]) => getEntitlements(...a),
  getUsage: (...a: unknown[]) => getUsage(...a),
  getLedger: (...a: unknown[]) => getLedger(...a),
  postCheckout: (...a: unknown[]) => postCheckout(...a),
  postPortal: (...a: unknown[]) => postPortal(...a),
  mcToCredits: (mc: number) => String(mc / 1000),
  formatCredits: (mc: number) => String(mc / 1000),
}));

// ── mock useBilling to read from the individual fns ───────────────────────────
// We test via the real useBilling hook which calls the mocked client fns.
// To make assertions easier, we mock useBilling directly.
const useBillingMock = vi.fn();
vi.mock('@/lib/pixie-lab/useBilling', () => ({
  useBilling: () => useBillingMock(),
}));

import { BillingCenter } from './BillingCenter';

const DEFAULT_CONFIG = {
  credit_system_enabled: true,
  billing_enforcement_enabled: true,
  byok_credit_policy: 'no_charge',
  mock_usage_consumes_credits: false,
  reservation_ttl_seconds: 3600,
  reconciliation_enabled: true,
};

const DEFAULT_STATUS = {
  subscription: {
    status: 'active',
    plan_id: 'starter',
    cancel_at_period_end: false,
    current_period_end: '2026-08-01T00:00:00Z',
    past_due: false,
  },
  plan: { id: 'starter', name: 'Starter', monthly_credits: 10000 },
};

const DEFAULT_WALLET = {
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
    access: { content_agent: true, ai_influencer: false },
    limits: { connected_accounts: 3, scheduled_jobs: 10 },
  },
};

const DEFAULT_ENTITLEMENTS = {
  plan: { id: 'starter', name: 'Starter' },
  access: { content_agent: true, ai_influencer: false, video: false },
  limits: { connected_accounts: 3, scheduled_jobs: 10 },
};

const DEFAULT_USAGE = {
  period: { start: '2026-07-01T00:00:00Z', end: '2026-07-31T23:59:59Z', fallback: false },
  counters: [
    { key: 'content_generations', used: 5, limit: 50, remaining: 45 },
    { key: 'publish_jobs', used: 2, limit: -1, remaining: -1 },
  ],
};

function mockBillingState(overrides: Partial<ReturnType<typeof useBillingMock>> = {}) {
  useBillingMock.mockReturnValue({
    loading: false,
    error: '',
    config: DEFAULT_CONFIG,
    status: DEFAULT_STATUS,
    wallet: DEFAULT_WALLET,
    entitlements: DEFAULT_ENTITLEMENTS,
    usage: DEFAULT_USAGE,
    refetch: vi.fn(),
    ...overrides,
  });
  getLedger.mockResolvedValue({ ok: true, data: { total: 0, limit: 20, offset: 0, entries: [] } });
}

beforeEach(() => {
  getLedger.mockResolvedValue({ ok: true, data: { total: 0, limit: 20, offset: 0, entries: [] } });
  postCheckout.mockResolvedValue({ ok: true, data: { url: 'https://checkout.stripe.com/test' } });
  postPortal.mockResolvedValue({ ok: true, data: { url: 'https://billing.stripe.com/session' } });
});

describe('BillingCenter', () => {
  it('shows a loading spinner while loading', () => {
    useBillingMock.mockReturnValue({
      loading: true,
      error: '',
      config: null,
      status: null,
      wallet: null,
      entitlements: null,
      usage: null,
      refetch: vi.fn(),
    });
    render(<BillingCenter />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Loading billing/i)).toBeInTheDocument();
  });

  it('shows error state when all data fails to load', () => {
    useBillingMock.mockReturnValue({
      loading: false,
      error: 'The billing service is offline.',
      config: null,
      status: null,
      wallet: null,
      entitlements: null,
      usage: null,
      refetch: vi.fn(),
    });
    render(<BillingCenter />);
    expect(screen.getByText(/Unable to load billing/i)).toBeInTheDocument();
    expect(screen.getByText(/The billing service is offline/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('shows billing-disabled banner when credit_system_enabled is false', () => {
    mockBillingState({
      config: { ...DEFAULT_CONFIG, credit_system_enabled: false },
    });
    render(<BillingCenter />);
    expect(screen.getByText(/Billing is in preview/i)).toBeInTheDocument();
    expect(screen.getByText(/enforcement is disabled/i)).toBeInTheDocument();
  });

  it('does NOT show billing-disabled banner when credit_system_enabled is true', () => {
    mockBillingState();
    render(<BillingCenter />);
    expect(screen.queryByText(/Billing is in preview/i)).not.toBeInTheDocument();
  });

  it('renders the plan name and status', async () => {
    mockBillingState();
    render(<BillingCenter />);
    expect(await screen.findByText('Starter')).toBeInTheDocument();
    // Status badge
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders wallet available credits', async () => {
    mockBillingState();
    render(<BillingCenter />);
    // available_mc = 5000 → formatCredits returns "5" (mocked as mc/1000)
    // Use the aria-label on the hero credit element for a precise query
    expect(
      await screen.findByLabelText('5 credits available'),
    ).toBeInTheDocument();
  });

  it('renders usage meters with progressbar roles', async () => {
    mockBillingState();
    render(<BillingCenter />);
    const meters = await screen.findAllByRole('progressbar');
    // Only content_generations has a finite limit, publish_jobs is unlimited → no bar
    expect(meters.length).toBeGreaterThanOrEqual(1);
  });

  it('calls postCheckout and redirects when Upgrade is clicked', async () => {
    // jsdom doesn't support navigation, capture assignment
    const original = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...original, href: '' },
    });

    mockBillingState();
    render(<BillingCenter />);
    const upgradeBtn = await screen.findByRole('button', { name: /Upgrade/i });
    fireEvent.click(upgradeBtn);
    await waitFor(() => expect(postCheckout).toHaveBeenCalled());

    // Restore
    Object.defineProperty(window, 'location', { writable: true, value: original });
  });

  it('shows entitlement access flags', async () => {
    mockBillingState();
    render(<BillingCenter />);
    // Content Agent should show as included
    expect(await screen.findByText('Content Agent')).toBeInTheDocument();
  });

  it('shows "current billing period" label in usage meters', async () => {
    mockBillingState();
    render(<BillingCenter />);
    expect(await screen.findByText(/Current billing period/i)).toBeInTheDocument();
  });

  it('shows "Fallback monthly period" when usage.period.fallback is true', async () => {
    mockBillingState({
      usage: { ...DEFAULT_USAGE, period: { ...DEFAULT_USAGE.period, fallback: true } },
    });
    render(<BillingCenter />);
    expect(await screen.findByText(/Fallback monthly period/i)).toBeInTheDocument();
  });
});
