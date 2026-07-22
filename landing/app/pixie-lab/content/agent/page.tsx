import type { Metadata } from 'next';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { AgentPageShell } from '@/components/pixie-lab/content/agent/AgentPageShell';
import { ContentAgentWorkspace } from '@/components/pixie-lab/content/agent/ContentAgentWorkspace';

export const metadata: Metadata = {
  title: 'Content Agent — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function ContentAgentPage() {
  const guard = await guardPermission('content.view');
  if (!guard.ok) return <AccessRestricted what="Content" />;
  return (
    <AgentPageShell title="Create written content" subtitle="Generate social posts, blogs, emails, ads and more — then edit, save and organize.">
      <ContentAgentWorkspace />
    </AgentPageShell>
  );
}
