import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { HashtagGeneratorWidget } from '@/components/tools/widgets/HashtagGeneratorWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'hashtag-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <HashtagGeneratorWidget />
    </ToolPageLayout>
  );
}
