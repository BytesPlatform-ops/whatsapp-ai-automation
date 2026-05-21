import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { ShareIncentivePlanWidget } from '@/components/tools/widgets/ShareIncentivePlanWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'share-incentive-plan-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <ShareIncentivePlanWidget />
    </ToolPageLayout>
  );
}
