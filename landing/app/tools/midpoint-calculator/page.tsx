import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { MidpointWidget } from '@/components/tools/widgets/MidpointWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'midpoint-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <MidpointWidget />
    </ToolPageLayout>
  );
}
