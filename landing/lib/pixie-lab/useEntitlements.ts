'use client';

import { useCallback, useEffect, useState } from 'react';
import { type AgentEntitlement, type AgentState, type FeedAgent } from './feed';

/**
 * useEntitlements — client hook for the CURRENT workspace's service access state.
 * The server (/api/lab/entitlements) resolves the workspace from the session and
 * returns only that workspace's services, so state can never leak across
 * accounts. There is NO global mock fallback: until the fetch resolves (and if it
 * fails), everything is locked — a fresh workspace inherits nothing.
 */

// Everything locked by default — a new/unknown workspace starts clean.
const LOCKED_ENTITLEMENTS: AgentEntitlement[] = (['website', 'receptionist', 'seo', 'marketing', 'content'] as FeedAgent[])
  .map((agent) => ({ agent, state: 'locked' as AgentState }));

export function useEntitlements(tenant: string) {
  const [entitlements, setEntitlements] = useState<AgentEntitlement[]>(LOCKED_ENTITLEMENTS);
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
