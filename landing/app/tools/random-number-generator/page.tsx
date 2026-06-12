import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { RandomNumberWidget } from '@/components/tools/widgets/RandomNumberWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'random-number-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <RandomNumberWidget />
    </ToolPageLayout>
  );
}
