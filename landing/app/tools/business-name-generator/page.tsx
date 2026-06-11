import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { BusinessNameWidget } from '@/components/tools/widgets/BusinessNameWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'business-name-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <BusinessNameWidget />
    </ToolPageLayout>
  );
}
