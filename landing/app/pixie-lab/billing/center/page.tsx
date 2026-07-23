import type { Metadata } from 'next';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { AgentPageShell } from '@/components/pixie-lab/content/agent/AgentPageShell';
import { BillingCenter } from '@/components/pixie-lab/billing/BillingCenter';

export const metadata: Metadata = {
  title: 'Billing Center — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function BillingCenterPage() {
  const guard = await guardPermission('content.view');
  if (!guard.ok) return <AccessRestricted what="Billing" />;
  return (
    <AgentPageShell
      title="Billing"
      subtitle="Manage your plan, credits, entitlements and transaction history."
    >
      <BillingCenter />
    </AgentPageShell>
  );
}
