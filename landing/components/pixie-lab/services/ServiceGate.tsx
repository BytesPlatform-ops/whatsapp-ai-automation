'use client';

import { Loader2 } from 'lucide-react';
import { useEntitlements } from '@/lib/pixie-lab/useEntitlements';
import { TrialUnlock } from '@/components/pixie-lab/TrialUnlock';
import type { FeedAgent } from '@/lib/pixie-lab/feed';

/**
 * ServiceGate — client-side activation gate for a service tool page. Mirrors
 * ServiceView: a locked service shows the TrialUnlock page (start trial / unlock)
 * instead of the tool, so deep-linking to /pixie-lab/seo/audit while locked can't
 * bypass entitlements. Access (RBAC) is already enforced server-side by the page
 * guard; this is the trial/lock layer. Both render inside the Pixie Lab shell.
 */
export function ServiceGate({ agent, tenant, children }: { agent: FeedAgent; tenant: string; children: React.ReactNode }) {
  const { entitlements, live, stateOf } = useEntitlements(tenant);
  const state = stateOf(agent);

  // Until the first entitlement fetch resolves, show a light placeholder rather
  // than flashing the locked page.
  if (!live && entitlements.every((e) => e.state === 'locked')) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-[var(--pl-text-muted)]">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (state === 'locked') return <TrialUnlock agent={agent} tenant={tenant} />;
  return <>{children}</>;
}
