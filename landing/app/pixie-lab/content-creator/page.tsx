import type { Metadata } from 'next';
import { CreatorWizard } from '@/components/pixie-lab/content/creator/CreatorWizard';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';

export const metadata: Metadata = {
  title: 'Content Creator — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function ContentCreatorPage() {
  const guard = await guardPermission('content.view');
  if (!guard.ok) return <AccessRestricted what="Content Creator" />;
  return <CreatorWizard />;
}
