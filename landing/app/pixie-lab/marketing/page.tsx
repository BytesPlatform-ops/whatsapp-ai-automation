import type { Metadata } from 'next';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { MarketingCommandCenter } from '@/components/pixie-lab/marketing/MarketingCommandCenter';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Marketing — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Marketing Command Center — the unified home of Pixie Marketing. Personalized
 * recommendations come from the Marketing Brain (connected Meta data), not static
 * cards. Detailed operations live in the tabbed workspace this page deep-links into.
 */
export default async function MarketingPage() {
  const guard = await guardPermission('marketing.view');
  if (!guard.ok) return <AccessRestricted what="Marketing" />;
  return <MarketingCommandCenter tenant={tenantForMembership(guard.membership)} />;
}
