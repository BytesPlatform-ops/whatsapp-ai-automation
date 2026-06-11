import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { ImageResizerWidget } from '@/components/tools/widgets/ImageResizerWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'image-resizer';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <ImageResizerWidget />
    </ToolPageLayout>
  );
}
