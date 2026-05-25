import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { DunkWidget } from '@/components/tools/widgets/DunkWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'dunk-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <DunkWidget />
    </ToolPageLayout>
  );
}
