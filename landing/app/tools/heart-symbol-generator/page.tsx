import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { HeartSymbolWidget } from '@/components/tools/widgets/HeartSymbolWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'heart-symbol-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <HeartSymbolWidget />
    </ToolPageLayout>
  );
}
