'use client';

import { BatchGeneratorWidget } from '@/components/tools/widgets/BatchGeneratorWidget';
import { pirateName } from '@/lib/generators';

export function PirateNameWidget() {
  return (
    <BatchGeneratorWidget
      slug="pirate-name-generator"
      generate={pirateName}
      buttonLabel="Generate names"
      tip="Tip: great for D&D characters, gamer handles, party themes, and stories. Hit Generate to plunder a fresh batch."
    />
  );
}
