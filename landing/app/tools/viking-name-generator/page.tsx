import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { VikingNameWidget } from '@/components/tools/widgets/VikingNameWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'viking-name-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <VikingNameWidget />
    </ToolPageLayout>
  );
}
