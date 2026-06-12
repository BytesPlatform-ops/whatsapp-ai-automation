import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { ColorPaletteWidget } from '@/components/tools/widgets/ColorPaletteWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'color-palette-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <ColorPaletteWidget />
    </ToolPageLayout>
  );
}
