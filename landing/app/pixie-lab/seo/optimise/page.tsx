import type { Metadata } from 'next';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { SeoWorkspace } from '@/components/pixie-lab/seo/SeoWorkspace';

export const metadata: Metadata = { title: 'SEO Optimise — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SeoOptimisePage({ searchParams }: { searchParams: { site_id?: string; page_id?: string; keyword?: string } }) {
  const guard = await guardPermission('seo.view');
  if (!guard.ok) return <AccessRestricted what="SEO" />;
  return (
    <SeoWorkspace
      tab="optimise"
      tenant={tenantForMembership(guard.membership)}
      initialSiteId={searchParams.site_id}
      initialPageId={searchParams.page_id}
      initialKeyword={searchParams.keyword}
    />
  );
}
