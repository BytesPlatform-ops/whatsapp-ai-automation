'use client';

import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import { AgentDashboard } from './AgentDashboard';
import { TrialUnlock } from './TrialUnlock';
import type { FeedAgent } from '@/lib/pixie-lab/feed';

/**
 * ServiceView — one canonical URL per service (/pixie-lab/<service>). Branches on
 * live entitlement state: locked → the TrialUnlock (locked/trial) page; active or
 * trial → the AgentDashboard. Both render inside the Pixie Lab shell, so a service
 * never leaves the Lab layout.
 */
export function ServiceView({ agent, tenant, nowMs }: { agent: FeedAgent; tenant: string; nowMs: number }) {
  const { stateOf } = useEntitlements(tenant);
  if (stateOf(agent) === 'locked') return <TrialUnlock agent={agent} tenant={tenant} />;
  return <AgentDashboard agent={agent} tenant={tenant} nowMs={nowMs} />;
}
