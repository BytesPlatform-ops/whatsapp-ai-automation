import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { BoldTextWidget } from '@/components/tools/widgets/BoldTextWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'bold-text-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <BoldTextWidget />
    </ToolPageLayout>
  );
}
