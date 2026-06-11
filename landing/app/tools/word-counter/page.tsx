import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { WordCounterWidget } from '@/components/tools/widgets/WordCounterWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'word-counter';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <WordCounterWidget />
    </ToolPageLayout>
  );
}
