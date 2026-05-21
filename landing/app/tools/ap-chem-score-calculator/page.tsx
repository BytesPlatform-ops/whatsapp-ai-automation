import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { ApChemWidget } from '@/components/tools/widgets/ApChemWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'ap-chem-score-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <ApChemWidget />
    </ToolPageLayout>
  );
}
