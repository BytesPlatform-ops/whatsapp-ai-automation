import { notFound } from 'next/navigation';
import { FullServicePipeline } from '@/components/pixie/full-service/FullServicePipeline';
import { getAgentBySlug } from '@/lib/agents';

export const dynamic = 'force-dynamic';

export default function AgentFullServicePage({ params }: { params: { slug: string } }) {
  const unit = getAgentBySlug(params.slug);
  if (!unit) notFound();
  return <FullServicePipeline unit={{ slug: unit.slug, name: unit.name, dashboardPath: unit.dashboardPath, fullServicePath: unit.fullServicePath, type: 'agent', accent: unit.accent }} />;
}
