import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { LoremIpsumWidget } from '@/components/tools/widgets/LoremIpsumWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'lorem-ipsum-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <LoremIpsumWidget />
    </ToolPageLayout>
  );
}
