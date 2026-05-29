import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { InvisibleTextWidget } from '@/components/tools/widgets/InvisibleTextWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'invisible-text-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <InvisibleTextWidget />
    </ToolPageLayout>
  );
}
