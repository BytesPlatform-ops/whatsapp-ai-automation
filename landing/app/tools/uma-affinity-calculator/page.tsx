import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { UmaAffinityWidget } from '@/components/tools/widgets/UmaAffinityWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'uma-affinity-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <UmaAffinityWidget />
    </ToolPageLayout>
  );
}
