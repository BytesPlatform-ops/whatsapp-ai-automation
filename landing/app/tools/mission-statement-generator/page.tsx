import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { MissionStatementWidget } from '@/components/tools/widgets/MissionStatementWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'mission-statement-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <MissionStatementWidget />
    </ToolPageLayout>
  );
}
