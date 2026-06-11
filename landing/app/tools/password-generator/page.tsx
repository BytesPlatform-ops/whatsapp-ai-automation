import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { PasswordGeneratorWidget } from '@/components/tools/widgets/PasswordGeneratorWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'password-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <PasswordGeneratorWidget />
    </ToolPageLayout>
  );
}
