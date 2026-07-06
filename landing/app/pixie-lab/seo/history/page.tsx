import type { Metadata } from 'next';
import { SeoWorkspace } from '@/components/pixie-lab/seo/SeoWorkspace';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { tenantForMembership } from '@/lib/pixie-lab/backend';

export const metadata: Metadata = { title: 'SEO History — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SeoHistoryPage() {
  const guard = await guardPermission('seo.view');
  if (!guard.ok) return <AccessRestricted what="SEO" />;
  return <SeoWorkspace tab="history" tenant={tenantForMembership(guard.membership)} />;
}
