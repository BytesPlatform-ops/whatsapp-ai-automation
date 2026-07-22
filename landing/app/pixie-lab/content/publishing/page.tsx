import type { Metadata } from 'next';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { AgentPageShell } from '@/components/pixie-lab/content/agent/AgentPageShell';
import { PublishingQueue } from '@/components/pixie-lab/content/publishing/PublishingQueue';

export const metadata: Metadata = {
  title: 'Publishing — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function PublishingPage() {
  const guard = await guardPermission('content.view');
  if (!guard.ok) return <AccessRestricted what="Content" />;
  return (
    <AgentPageShell title="Publishing queue" subtitle="Schedule, monitor and manage social publish jobs. Dry-run by default.">
      <PublishingQueue />
    </AgentPageShell>
  );
}
