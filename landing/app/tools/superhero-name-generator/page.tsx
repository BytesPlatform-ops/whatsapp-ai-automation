import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { SuperheroNameWidget } from '@/components/tools/widgets/SuperheroNameWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'superhero-name-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <SuperheroNameWidget />
    </ToolPageLayout>
  );
}
