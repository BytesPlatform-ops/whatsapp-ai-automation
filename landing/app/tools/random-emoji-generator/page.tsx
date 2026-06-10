import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { RandomEmojiWidget } from '@/components/tools/widgets/RandomEmojiWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'random-emoji-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <RandomEmojiWidget />
    </ToolPageLayout>
  );
}
