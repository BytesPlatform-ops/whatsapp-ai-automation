import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { ApPsychWidget } from '@/components/tools/widgets/ApPsychWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'ap-psych-score-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <ApPsychWidget />
    </ToolPageLayout>
  );
}
