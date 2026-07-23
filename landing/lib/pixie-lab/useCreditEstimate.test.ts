import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ── mock billingClient before importing the hook ──────────────────────────────

const getBillingConfig = vi.fn();
const postEstimate = vi.fn();

vi.mock('./billingClient', () => ({
  getBillingConfig: (...a: unknown[]) => getBillingConfig(...a),
  postEstimate: (...a: unknown[]) => postEstimate(...a),
}));

import { useCreditEstimate } from './useCreditEstimate';
import type { EstimateRequest } from './billingClient';

const MOCK_CONFIG_DISABLED = {
  ok: true as const,
  data: {
    credit_system_enabled: false,
    billing_enforcement_enabled: false,
    byok_credit_policy: 'no_charge',
    mock_usage_consumes_credits: false,
    reservation_ttl_seconds: 3600,
    reconciliation_enabled: false,
  },
};

const MOCK_CONFIG_ENABLED = {
  ok: true as const,
  data: {
    credit_system_enabled: true,
    billing_enforcement_enabled: true,
    byok_credit_policy: 'no_charge',
    mock_usage_consumes_credits: false,
    reservation_ttl_seconds: 3600,
    reconciliation_enabled: true,
  },
};

const MOCK_ESTIMATE = {
  ok: true as const,
  data: {
    operation_type: 'content_text',
    estimated_credits_mc: 500,
    max_reservation_mc: 600,
    mock: true,
    byok: false,
    byok_policy: 'no_charge',
    enforcement_enabled: false,
    credit_system_enabled: true,
    available_mc: 10000,
    sufficient: true,
  },
};

const REQ: EstimateRequest = {
  operation: 'content_text',
  variations: 1,
  is_mock: true,
  byok: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCreditEstimate', () => {
  it('returns show=false and no estimate when req is null', () => {
    const { result } = renderHook(() => useCreditEstimate(null));
    expect(result.current.show).toBe(false);
    expect(result.current.estimate).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns show=false and never fetches estimate when credit system is disabled (default path)', async () => {
    getBillingConfig.mockResolvedValue(MOCK_CONFIG_DISABLED);

    const { result } = renderHook(() => useCreditEstimate(REQ));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.show).toBe(false);
    expect(result.current.estimate).toBeNull();
    expect(getBillingConfig).toHaveBeenCalledTimes(1);
    // postEstimate must NOT be called when credit system is disabled
    expect(postEstimate).not.toHaveBeenCalled();
  });

  it('returns show=true and the estimate when credit system is enabled', async () => {
    getBillingConfig.mockResolvedValue(MOCK_CONFIG_ENABLED);
    postEstimate.mockResolvedValue(MOCK_ESTIMATE);

    const { result } = renderHook(() => useCreditEstimate(REQ));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.show).toBe(true);
    expect(result.current.estimate).toEqual(MOCK_ESTIMATE.data);
    expect(postEstimate).toHaveBeenCalledTimes(1);
    expect(postEstimate).toHaveBeenCalledWith(REQ);
  });

  it('silently swallows estimate errors and leaves estimate null', async () => {
    getBillingConfig.mockResolvedValue(MOCK_CONFIG_ENABLED);
    postEstimate.mockResolvedValue({
      ok: false,
      error: { kind: 'offline', status: 0, message: 'Network error' },
    });

    const { result } = renderHook(() => useCreditEstimate(REQ));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.show).toBe(true);
    // estimate is null because the request failed, but no throw
    expect(result.current.estimate).toBeNull();
  });

  it('silently swallows config errors and returns show=false', async () => {
    getBillingConfig.mockResolvedValue({
      ok: false,
      error: { kind: 'offline', status: 0, message: 'Config unavailable' },
    });

    const { result } = renderHook(() => useCreditEstimate(REQ));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.show).toBe(false);
    expect(result.current.estimate).toBeNull();
    expect(postEstimate).not.toHaveBeenCalled();
  });
});
