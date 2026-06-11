import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { QrCodeWidget } from '@/components/tools/widgets/QrCodeWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'qr-code-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <QrCodeWidget />
    </ToolPageLayout>
  );
}
