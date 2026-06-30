'use client';

import { useCallback, useEffect, useState } from 'react';
import { MOCK_ENTITLEMENTS, type AgentEntitlement, type AgentState, type FeedAgent } from './feed';

/**
 * useEntitlements — shared client hook for live agent access state. Fetches the
 * entitlements engine via the same-origin proxy and falls back to MOCK_ENTITLEMENTS
 * when the backend is down, so the Lab still renders. Exposes startTrial() which
 * hits the engine and refreshes.
 */
export function useEntitlements(tenant: string) {
  const [entitlements, setEntitlements] = useState<AgentEntitlement[]>(MOCK_ENTITLEMENTS);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/lab/entitlements?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store' });
      const d = await r.json();
      if (d?.backendUp && Array.isArray(d.entitlements)) {
        setEntitlements(
          d.entitlements.map((e: { agent: FeedAgent; state: AgentState; trial_ends_at?: string }) => ({
            agent: e.agent,
            state: e.state,
            trialEndsAt: e.trial_ends_at ?? undefined,
          })),
        );
        setLive(true);
      }
    } catch {
      /* keep mock */
    }
  }, [tenant]);

  useEffect(() => {
    load();
  }, [load]);

  const startTrial = useCallback(
    async (agent: FeedAgent) => {
      try {
        await fetch('/api/lab/entitlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start_trial', tenant_id: tenant, agent }),
        });
        await load();
      } catch {
        /* ignore */
      }
    },
    [tenant, load],
  );

  const activate = useCallback(
    async (agent: FeedAgent) => {
      try {
        await fetch('/api/lab/entitlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'activate', tenant_id: tenant, agent }),
        });
        await load();
      } catch {
        /* ignore */
      }
    },
    [tenant, load],
  );

  const stateOf = useCallback(
    (agent: FeedAgent): AgentState => entitlements.find((e) => e.agent === agent)?.state ?? 'locked',
    [entitlements],
  );

  return { entitlements, live, startTrial, activate, stateOf, reload: load };
}
