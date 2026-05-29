import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { UpsideDownWidget } from '@/components/tools/widgets/UpsideDownWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'upside-down-text-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <UpsideDownWidget />
    </ToolPageLayout>
  );
}
