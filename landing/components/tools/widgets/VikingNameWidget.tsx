'use client';

import { BatchGeneratorWidget } from '@/components/tools/widgets/BatchGeneratorWidget';
import { vikingName } from '@/lib/generators';

export function VikingNameWidget() {
  return (
    <BatchGeneratorWidget
      slug="viking-name-generator"
      generate={vikingName}
      buttonLabel="Generate names"
      tip="Tip: pair a first name with a byname (an earned epithet) for the classic Norse feel — like Ragnar Bloodaxe. Hit Generate for a fresh set."
    />
  );
}
