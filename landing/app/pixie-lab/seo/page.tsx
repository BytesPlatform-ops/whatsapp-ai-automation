import type { Metadata } from 'next';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { ServiceView } from '@/components/pixie-lab/ServiceView';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';

export const metadata: Metadata = { title: 'Seo — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function SeoPage() {
  const guard = await guardPermission('seo.view');
  if (!guard.ok) return <AccessRestricted what="Seo" />;

  // Use the workspace-scoped tenant (ws_<workspaceId>) so the overview page,
  // entitlements, feed, and SEO tools all operate on the same tenant namespace.
  // Previously this used tenantForUser (t_<userId>) which mismatched the tools.
  const tenant = tenantForMembership(guard.membership);
  return <ServiceView agent="seo" tenant={tenant} nowMs={Date.now()} />;
}
