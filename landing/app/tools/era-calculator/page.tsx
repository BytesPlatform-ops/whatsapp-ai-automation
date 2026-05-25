import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { EraWidget } from '@/components/tools/widgets/EraWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'era-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <EraWidget />
    </ToolPageLayout>
  );
}
