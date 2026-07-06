import type { Metadata } from 'next';
import { SeoWorkspace } from '@/components/pixie-lab/seo/SeoWorkspace';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { tenantForMembership } from '@/lib/pixie-lab/backend';

export const metadata: Metadata = { title: 'SEO Audit — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SeoAuditPage({ searchParams }: { searchParams: { url?: string; audit_id?: string } }) {
  const guard = await guardPermission('seo.view');
  if (!guard.ok) return <AccessRestricted what="SEO" />;
  return <SeoWorkspace tab="audit" tenant={tenantForMembership(guard.membership)} initialUrl={searchParams?.url} auditId={searchParams?.audit_id} />;
}
