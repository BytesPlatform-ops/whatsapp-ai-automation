import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { TinyTextWidget } from '@/components/tools/widgets/TinyTextWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'tiny-text-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <TinyTextWidget />
    </ToolPageLayout>
  );
}
