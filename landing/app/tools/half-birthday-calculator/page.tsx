import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { HalfBirthdayWidget } from '@/components/tools/widgets/HalfBirthdayWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'half-birthday-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <HalfBirthdayWidget />
    </ToolPageLayout>
  );
}
