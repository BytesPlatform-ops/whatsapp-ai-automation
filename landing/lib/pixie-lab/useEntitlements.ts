'use client';

import { useCallback, useEffect, useState } from 'react';
import { type AgentEntitlement, type AgentState, type FeedAgent } from './feed';

/**
 * useEntitlements — client hook for the CURRENT workspace's service access state.
 * The server (/api/lab/entitlements) resolves the workspace from the session and
 * returns only that workspace's services, so state can never leak across accounts.
 *
 * UX: to avoid flashing the locked/pricing page while the state loads, callers
 * should render a loading placeholder until `loading` is false (never assume
 * "locked" mid-fetch). Results are cached per-tab (sessionStorage,
 * stale-while-revalidate) so repeat navigations show the right page instantly,
 * and concurrent callers on the same page share a single network request.
 */

const AGENTS: FeedAgent[] = ['website', 'receptionist', 'seo', 'marketing', 'content'];
const LOCKED_ENTITLEMENTS: AgentEntitlement[] = AGENTS.map((agent) => ({ agent, state: 'locked' as AgentState }));

const cacheKey = (tenant: string) => `pl_ent_${tenant}`;

function readCache(tenant: string): AgentEntitlement[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(tenant));
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? (arr as AgentEntitlement[]) : null;
  } catch {
    return null;
  }
}
function writeCache(tenant: string, ent: AgentEntitlement[]) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(cacheKey(tenant), JSON.stringify(ent)); } catch { /* ignore */ }
}

// Dedupe concurrent fetches for the same tenant — the shell, ServiceView and
// AgentDashboard all mount together and would otherwise each hit the endpoint.
const inflight = new Map<string, Promise<AgentEntitlement[] | null>>();
function fetchEntitlements(tenant: string): Promise<AgentEntitlement[] | null> {
  const existing = inflight.get(tenant);
  if (existing) return existing;
  const p = (async () => {
    try {
      const r = await fetch(`/api/lab/entitlements?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store' });
      const d = await r.json();
      if (d?.backendUp && Array.isArray(d.entitlements)) {
        return d.entitlements.map((e: { agent: FeedAgent; state: AgentState; trial_ends_at?: string }) => ({
          agent: e.agent, state: e.state, trialEndsAt: e.trial_ends_at ?? undefined,
        }));
      }
      return null;
    } catch {
      return null;
    } finally {
      inflight.delete(tenant);
    }
  })();
  inflight.set(tenant, p);
  return p;
}

export function useEntitlements(tenant: string) {
  // SSR-safe: start locked/loading (matches server render); the effect below
  // immediately applies any cached state, then revalidates in the background.
  const [entitlements, setEntitlements] = useState<AgentEntitlement[]>(LOCKED_ENTITLEMENTS);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const ent = await fetchEntitlements(tenant);
    if (ent) {
      setEntitlements(ent);
      setLive(true);
      writeCache(tenant, ent);
    }
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    // Show the last-known state instantly (no pricing flash on repeat visits),
    // then revalidate.
    const cached = readCache(tenant);
    if (cached) {
      setEntitlements(cached);
      setLive(true);
      setLoading(false);
    }
    load();
  }, [tenant, load]);

  const startTrial = useCallback(
    async (agent: FeedAgent) => {
      try {
        await fetch('/api/lab/entitlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start_trial', tenant_id: tenant, agent }),
        });
        await load();
      } catch { /* ignore */ }
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
      } catch { /* ignore */ }
    },
    [tenant, load],
  );

  const stateOf = useCallback(
    (agent: FeedAgent): AgentState => entitlements.find((e) => e.agent === agent)?.state ?? 'locked',
    [entitlements],
  );

  return { entitlements, live, loading, startTrial, activate, stateOf, reload: load };
}
