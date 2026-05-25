import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { CrosswindWidget } from '@/components/tools/widgets/CrosswindWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'crosswind-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <CrosswindWidget />
    </ToolPageLayout>
  );
}
