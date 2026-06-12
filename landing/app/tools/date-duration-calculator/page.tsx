import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { DateDurationWidget } from '@/components/tools/widgets/DateDurationWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'date-duration-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <DateDurationWidget />
    </ToolPageLayout>
  );
}
