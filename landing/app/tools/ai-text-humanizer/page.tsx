import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { AiTextHumanizerWidget } from '@/components/tools/widgets/AiTextHumanizerWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'ai-text-humanizer';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <AiTextHumanizerWidget />
    </ToolPageLayout>
  );
}
