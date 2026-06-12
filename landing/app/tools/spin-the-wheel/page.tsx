import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { SpinTheWheelWidget } from '@/components/tools/widgets/SpinTheWheelWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'spin-the-wheel';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <SpinTheWheelWidget />
    </ToolPageLayout>
  );
}
