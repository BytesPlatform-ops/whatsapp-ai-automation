'use client';

import { BatchGeneratorWidget } from '@/components/tools/widgets/BatchGeneratorWidget';
import { superheroName } from '@/lib/generators';

export function SuperheroNameWidget() {
  return (
    <BatchGeneratorWidget
      slug="superhero-name-generator"
      generate={superheroName}
      buttonLabel="Generate names"
      tip="Tip: mix and match — an adjective plus a noun is the classic superhero formula (The Crimson Falcon). Hit Generate for a new lineup."
    />
  );
}
