'use client';

import { Loader2 } from 'lucide-react';
import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import { AgentDashboard } from './AgentDashboard';
import { TrialUnlock } from './TrialUnlock';
import type { FeedAgent } from '@/lib/pixie-lab/feed';

/**
 * ServiceView — one canonical URL per service (/pixie-lab/<service>). Branches on
 * live entitlement state: locked → the TrialUnlock (locked/trial) page; active or
 * trial → the AgentDashboard. Both render inside the Pixie Lab shell, so a service
 * never leaves the Lab layout.
 *
 * While the entitlement state is still loading we show a neutral placeholder —
 * NOT the locked/pricing page — so an unlocked service never flashes its pricing
 * cards before the real page loads.
 */
export function ServiceView({ agent, tenant, nowMs }: { agent: FeedAgent; tenant: string; nowMs: number }) {
  const { stateOf, loading } = useEntitlements(tenant);
  if (loading) return <ServiceLoading />;
  if (stateOf(agent) === 'locked') return <TrialUnlock agent={agent} tenant={tenant} />;
  return <AgentDashboard agent={agent} tenant={tenant} nowMs={nowMs} />;
}

function ServiceLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-[var(--pl-text-muted)]">
      <Loader2 size={22} className="animate-spin" />
    </div>
  );
}
