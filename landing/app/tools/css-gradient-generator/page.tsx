import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { CssGradientWidget } from '@/components/tools/widgets/CssGradientWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'css-gradient-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <CssGradientWidget />
    </ToolPageLayout>
  );
}
