import type { Metadata } from 'next';
import { ToolPageLayout } from '@/components/tools/ToolPageLayout';
import { RandomFoodWidget } from '@/components/tools/widgets/RandomFoodWidget';
import { buildToolMetadata, requireTool } from '@/lib/toolMetadata';

const SLUG = 'random-food-generator';

export const metadata: Metadata = buildToolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageLayout tool={requireTool(SLUG)}>
      <RandomFoodWidget />
    </ToolPageLayout>
  );
}
