import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { SpeechBubbleMemeWidget } from '@/components/tools/widgets/SpeechBubbleMemeWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'speech-bubble-meme-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <SpeechBubbleMemeWidget />
    </ToolPageLayout>
  );
}
