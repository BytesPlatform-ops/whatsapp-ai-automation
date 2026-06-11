import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { AgeCalculatorWidget } from '@/components/tools/widgets/AgeCalculatorWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'age-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <AgeCalculatorWidget />
    </ToolPageLayout>
  );
}
