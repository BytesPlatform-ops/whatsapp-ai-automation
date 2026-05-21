import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { TrustBadgeWidget } from '@/components/tools/widgets/TrustBadgeWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'trust-badge-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <TrustBadgeWidget />
    </ToolPageLayout>
  );
}
