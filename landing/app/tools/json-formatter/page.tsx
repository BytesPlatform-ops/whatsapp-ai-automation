import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { JsonFormatterWidget } from '@/components/tools/widgets/JsonFormatterWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'json-formatter';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <JsonFormatterWidget />
    </ToolPageLayout>
  );
}
