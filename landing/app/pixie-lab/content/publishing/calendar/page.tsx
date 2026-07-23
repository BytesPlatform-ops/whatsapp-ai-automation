import type { Metadata } from 'next';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { AgentPageShell } from '@/components/pixie-lab/content/agent/AgentPageShell';
import { PublishingCalendar } from '@/components/pixie-lab/content/publishing/PublishingCalendar';

export const metadata: Metadata = {
  title: 'Publishing calendar — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function PublishingCalendarPage() {
  const guard = await guardPermission('content.view');
  if (!guard.ok) return <AccessRestricted what="Content" />;
  return (
    <AgentPageShell
      title="Publishing calendar"
      subtitle="View, filter and manage scheduled social posts by day, week or month."
    >
      <PublishingCalendar />
    </AgentPageShell>
  );
}
