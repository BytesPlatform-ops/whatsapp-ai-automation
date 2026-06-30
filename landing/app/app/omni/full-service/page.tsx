import { FullServicePipeline } from '@/components/pixie/full-service/FullServicePipeline';
import { OMNI } from '@/lib/agents';

export const dynamic = 'force-dynamic';

export default function OmniFullServicePage() {
  return <FullServicePipeline unit={{ slug: OMNI.slug, name: OMNI.name, dashboardPath: OMNI.dashboardPath, fullServicePath: OMNI.fullServicePath, type: 'omni', accent: OMNI.accent }} />;
}
