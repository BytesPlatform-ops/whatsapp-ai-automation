import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { AmbigramWidget } from '@/components/tools/widgets/AmbigramWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'ambigram-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <AmbigramWidget />
    </ToolPageLayout>
  );
}
