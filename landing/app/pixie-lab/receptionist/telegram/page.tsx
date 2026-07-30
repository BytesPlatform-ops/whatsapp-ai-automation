import type { Metadata } from 'next';
import { ReceptionistWorkspace } from '@/components/pixie-lab/receptionist/ReceptionistWorkspace';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { tenantForMembership } from '@/lib/pixie-lab/backend';

export const metadata: Metadata = { title: 'Receptionist Telegram — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const guard = await guardPermission('receptionist.view');
  if (!guard.ok) return <AccessRestricted what="Receptionist" />;
  return <ReceptionistWorkspace tab="telegram" tenant={tenantForMembership(guard.membership)} />;
}
