import { notFound } from 'next/navigation';
import { FullServicePipeline } from '@/components/pixie/full-service/FullServicePipeline';
import { getAgentByBackendKey } from '@/lib/agents';

export const dynamic = 'force-dynamic';

export default function Page() {
  const unit = getAgentByBackendKey('seo');
  if (!unit) notFound();
  return (
    <FullServicePipeline
      unit={{ slug: unit.slug, name: unit.name, dashboardPath: unit.dashboardPath, fullServicePath: unit.fullServicePath, type: 'agent', accent: unit.accent }}
    />
  );
}
