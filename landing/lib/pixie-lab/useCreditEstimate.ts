'use client';

/**
 * useCreditEstimate — non-blocking credit estimate hook for product confirmation
 * surfaces. When the credit system is disabled (the default), `show` is false and
 * nothing extra renders, so existing UI is byte-for-byte unchanged.
 *
 * Usage:
 *   const { show, estimate, loading } = useCreditEstimate(req);
 *   // only render <CreditEstimateBadge> when show && estimate
 */

import { useEffect, useRef, useState } from 'react';
import { getBillingConfig, postEstimate } from './billingClient';
import type { EstimateRequest, EstimateResponse } from './billingClient';

export type { EstimateRequest };

export interface CreditEstimateResult {
  show: boolean;
  estimate: EstimateResponse | null;
  loading: boolean;
}

export function useCreditEstimate(req: EstimateRequest | null): CreditEstimateResult {
  const [show, setShow] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Stable ref to abort in-flight requests when req changes or unmount.
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!req) {
      // Nothing to estimate — reset and stay silent.
      setShow(false);
      setEstimate(null);
      setLoading(false);
      return;
    }

    let alive = true;
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;

    (async () => {
      setLoading(true);
      // 1. Check whether the credit system is enabled. Default path: disabled →
      //    show stays false and we never issue an estimate request.
      const configResult = await getBillingConfig(ac.signal);
      if (!alive || ac.signal.aborted) return;

      if (!configResult.ok || !configResult.data.credit_system_enabled) {
        setShow(false);
        setEstimate(null);
        setLoading(false);
        return;
      }

      setShow(true);

      // 2. Fetch the estimate (best-effort; errors are swallowed — billing UI is
      //    never blocking).
      const estimateResult = await postEstimate(req);
      if (!alive || ac.signal.aborted) return;

      if (estimateResult.ok) {
        setEstimate(estimateResult.data);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
      ac.abort();
    };
    // `req` is compared by identity; callers should memoize or pass a stable object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    req,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    req?.operation,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    req?.variations,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    req?.duration_seconds,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    req?.is_mock,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    req?.byok,
  ]);

  return { show, estimate, loading };
}
