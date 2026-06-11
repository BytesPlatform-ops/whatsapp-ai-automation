import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { ColorPickerWidget } from '@/components/tools/widgets/ColorPickerWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'color-picker';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <ColorPickerWidget />
    </ToolPageLayout>
  );
}
