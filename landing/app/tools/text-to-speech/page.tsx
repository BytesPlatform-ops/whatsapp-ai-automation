import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { TextToSpeechWidget } from '@/components/tools/widgets/TextToSpeechWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'text-to-speech';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <TextToSpeechWidget />
    </ToolPageLayout>
  );
}
