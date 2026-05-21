import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { SuperscriptWidget } from '@/components/tools/widgets/SuperscriptWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'superscript-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <SuperscriptWidget />
    </ToolPageLayout>
  );
}
