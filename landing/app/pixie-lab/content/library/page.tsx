import type { Metadata } from 'next';
import { tenantForMembership } from '@/lib/pixie-lab/backend';
import { ContentWorkspace } from '@/components/pixie-lab/content/ContentWorkspace';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';

export const metadata: Metadata = {
  title: 'Content Library — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';


export default async function ContentLibraryPage() {
  const guard = await guardPermission('content.view');
  if (!guard.ok) return <AccessRestricted what="Content" />;
  return <ContentWorkspace tab="library" tenant={tenantForMembership(guard.membership)} />;
}
