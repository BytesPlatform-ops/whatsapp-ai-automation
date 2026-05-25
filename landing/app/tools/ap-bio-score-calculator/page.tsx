import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { ApBioWidget } from '@/components/tools/widgets/ApBioWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'ap-bio-score-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <ApBioWidget />
    </ToolPageLayout>
  );
}
