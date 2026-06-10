import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { AnimeNameWidget } from '@/components/tools/widgets/AnimeNameWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'anime-name-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <AnimeNameWidget />
    </ToolPageLayout>
  );
}
