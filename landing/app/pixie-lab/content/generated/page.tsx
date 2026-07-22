import type { Metadata } from 'next';
import { AccessRestricted } from '@/components/pixie-lab/PageKit';
import { guardPermission } from '@/lib/workspace';
import { AgentPageShell } from '@/components/pixie-lab/content/agent/AgentPageShell';
import { GeneratedLibrary } from '@/components/pixie-lab/content/agent/GeneratedLibrary';

export const metadata: Metadata = {
  title: 'Generated Content — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function GeneratedContentPage() {
  const guard = await guardPermission('content.view');
  if (!guard.ok) return <AccessRestricted what="Content" />;
  return (
    <AgentPageShell title="Generated content library" subtitle="Search, filter, edit, duplicate and manage every piece of content you've generated.">
      <GeneratedLibrary />
    </AgentPageShell>
  );
}
