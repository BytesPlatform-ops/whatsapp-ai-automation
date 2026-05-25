import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { DotsWidget } from '@/components/tools/widgets/DotsWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'dots-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <DotsWidget />
    </ToolPageLayout>
  );
}
