import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { BacalaureatWidget } from '@/components/tools/widgets/BacalaureatWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'calculator-bacalaureat';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <BacalaureatWidget />
    </ToolPageLayout>
  );
}
