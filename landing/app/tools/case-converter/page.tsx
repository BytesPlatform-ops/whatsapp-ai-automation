import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { CaseConverterWidget } from '@/components/tools/widgets/CaseConverterWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'case-converter';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <CaseConverterWidget />
    </ToolPageLayout>
  );
}
