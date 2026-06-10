import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { PirateNameWidget } from '@/components/tools/widgets/PirateNameWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'pirate-name-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <PirateNameWidget />
    </ToolPageLayout>
  );
}
