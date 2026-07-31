import type { Metadata } from 'next';
import { Suspense } from 'react';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { MarketingFullService } from '@/components/pixie-lab/marketing/MarketingFullService';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Marketing Workspace — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The unified Meta marketing workspace. Tab is driven by ?tab= (Overview / Meta
 * Ads / Brand Brain / Ideas / Calendar / Inbox / Comments / Content / Approvals);
 * a ?draft= id deep-links a recommendation into the matching tab. This is the
 * single detailed surface the Command Center links into.
 */
export default async function MarketingFullServicePage() {
  const guard = await guardPermission('marketing.view');
  if (!guard.ok) return <AccessRestricted what="Marketing" />;
  return (
    <Suspense>
      <MarketingFullService tenant={tenantForMembership(guard.membership)} />
    </Suspense>
  );
}
