import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { XboxGamertagWidget } from '@/components/tools/widgets/XboxGamertagWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'xbox-gamertag-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <XboxGamertagWidget />
    </ToolPageLayout>
  );
}
