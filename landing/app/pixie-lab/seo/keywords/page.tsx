import type { Metadata } from 'next';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { SeoWorkspace } from '@/components/pixie-lab/seo/SeoWorkspace';

export const metadata: Metadata = { title: 'SEO Keywords — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SeoKeywordsPage({ searchParams }: { searchParams: { project_id?: string; site_id?: string } }) {
  const guard = await guardPermission('seo.view');
  if (!guard.ok) return <AccessRestricted what="SEO" />;
  return (
    <SeoWorkspace
      tab="keywords"
      tenant={tenantForMembership(guard.membership)}
      initialProjectId={searchParams.project_id}
      initialSiteId={searchParams.site_id}
    />
  );
}
