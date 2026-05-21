import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { PoolSaltWidget } from '@/components/tools/widgets/PoolSaltWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'pool-salt-calculator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <PoolSaltWidget />
    </ToolPageLayout>
  );
}
