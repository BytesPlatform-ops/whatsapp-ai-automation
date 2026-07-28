import type { Metadata } from 'next';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { SeoWorkspace } from '@/components/pixie-lab/seo/SeoWorkspace';

export const metadata: Metadata = { title: 'Locations — Pixie Lab SEO', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SeoLocationsPage() {
  const guard = await guardPermission('seo.manage');
  if (!guard.ok) return <AccessRestricted what="SEO" />;
  return (
    <SeoWorkspace
      tab="locations"
      tenant={tenantForMembership(guard.membership)}
    />
  );
}
