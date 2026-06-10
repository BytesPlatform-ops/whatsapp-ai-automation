import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { DapaCheckerWidget } from '@/components/tools/widgets/DapaCheckerWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'da-pa-checker';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <DapaCheckerWidget />
    </ToolPageLayout>
  );
}
