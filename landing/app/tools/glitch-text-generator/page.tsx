import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { GlitchTextWidget } from '@/components/tools/widgets/GlitchTextWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'glitch-text-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <GlitchTextWidget />
    </ToolPageLayout>
  );
}
