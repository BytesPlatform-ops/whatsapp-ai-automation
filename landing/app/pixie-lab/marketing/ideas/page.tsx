import type { Metadata } from 'next';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { MarketingWorkspace } from '@/components/pixie-lab/marketing/MarketingWorkspace';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Idea Curator — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MarketingIdeasPage() {
  const guard = await guardPermission('marketing.view');
  if (!guard.ok) return <AccessRestricted what="Marketing" />;
  return <MarketingWorkspace tab="ideas" tenant={tenantForMembership(guard.membership)} />;
}
