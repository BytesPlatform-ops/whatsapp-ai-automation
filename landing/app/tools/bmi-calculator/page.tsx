import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { BmiCalculatorWidget } from '@/components/tools/widgets/BmiCalculatorWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'bmi-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <BmiCalculatorWidget />
    </ToolPageLayout>
  );
}
