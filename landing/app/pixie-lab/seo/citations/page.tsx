import type { Metadata } from 'next';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { SeoWorkspace } from '@/components/pixie-lab/seo/SeoWorkspace';

export const metadata: Metadata = { title: 'Citations — Pixie Lab SEO', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SeoCitationsPage({ searchParams }: { searchParams: Promise<{ location_id?: string }> }) {
  const guard = await guardPermission('seo.view');
  if (!guard.ok) return <AccessRestricted what="SEO" />;
  const { location_id } = await searchParams;
  return (
    <SeoWorkspace
      tab="citations"
      tenant={tenantForMembership(guard.membership)}
      locationId={location_id}
    />
  );
}
