'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
} from './billingClient';

/**
 * useBilling — loads config, status, wallet, entitlements and usage in parallel
 * via a single AbortController so all fetches are cancelled together on unmount
 * or re-fetch. Returns a stable `refetch` callback.
 */

export interface BillingState {
  loading: boolean;
  error: string;
  config: BillingConfig | null;
  status: BillingStatus | null;
  wallet: WalletResponse | null;
  entitlements: EntitlementsResponse | null;
  usage: UsageResponse | null;
  refetch: () => void;
}

export function useBilling(): BillingState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsResponse | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError('');

    const [configRes, statusRes, walletRes, entRes, usageRes] = await Promise.all([
      getBillingConfig(ctrl.signal),
      getBillingStatus(ctrl.signal),
      getWallet(ctrl.signal),
      getEntitlements(ctrl.signal),
      getUsage(ctrl.signal),
    ]).catch((e) => {
      // AbortError: component unmounted — silently bail
      if ((e as Error)?.name === 'AbortError') return null;
      throw e;
    }) ?? [null, null, null, null, null];

    if (ctrl.signal.aborted) return;

    // Surface the first error encountered (prefer the most critical)
    let firstError = '';
    if (!configRes) {
      // Promise.all rejected; already aborted
    } else {
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
  }, [fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  return { loading, error, config, status, wallet, entitlements, usage, refetch };
}
