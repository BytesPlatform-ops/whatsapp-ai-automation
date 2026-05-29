import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { TextSummarizerWidget } from '@/components/tools/widgets/TextSummarizerWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'text-summarizer';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <TextSummarizerWidget />
    </ToolPageLayout>
  );
}
