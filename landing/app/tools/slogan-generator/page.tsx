import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { SloganGeneratorWidget } from '@/components/tools/widgets/SloganGeneratorWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'slogan-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <SloganGeneratorWidget />
    </ToolPageLayout>
  );
}
