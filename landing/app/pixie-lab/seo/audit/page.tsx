import type { Metadata } from 'next';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { SeoWorkspace } from '@/components/pixie-lab/seo/SeoWorkspace';

export const metadata: Metadata = { title: 'New SEO Audit — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SeoAuditPage({
  searchParams,
}: {
  searchParams: { url?: string; audit_id?: string; site_id?: string };
}) {
  const guard = await guardPermission('seo.view');
  if (!guard.ok) return <AccessRestricted what="SEO" />;
  return (
    <SeoWorkspace
      tab="audit"
      tenant={tenantForMembership(guard.membership)}
      initialUrl={searchParams?.url}
      auditId={searchParams?.audit_id}
      siteId={searchParams?.site_id}
    />
  );
}
