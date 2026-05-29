import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { StrikethroughWidget } from '@/components/tools/widgets/StrikethroughWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'strikethrough-text-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <StrikethroughWidget />
    </ToolPageLayout>
  );
}
