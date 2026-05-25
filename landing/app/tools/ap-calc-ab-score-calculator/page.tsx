import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { ApCalcAbWidget } from '@/components/tools/widgets/ApCalcAbWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'ap-calc-ab-score-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <ApCalcAbWidget />
    </ToolPageLayout>
  );
}
