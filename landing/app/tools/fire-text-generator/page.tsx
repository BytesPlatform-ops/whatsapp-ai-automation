import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { FireTextWidget } from '@/components/tools/widgets/FireTextWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'fire-text-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <FireTextWidget />
    </ToolPageLayout>
  );
}
