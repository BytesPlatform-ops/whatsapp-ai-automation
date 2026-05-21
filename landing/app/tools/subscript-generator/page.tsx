import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { SubscriptWidget } from '@/components/tools/widgets/SubscriptWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'subscript-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <SubscriptWidget />
    </ToolPageLayout>
  );
}
