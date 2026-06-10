'use client';

import { BatchGeneratorWidget } from '@/components/tools/widgets/BatchGeneratorWidget';
import { animeName } from '@/lib/generators';

export function AnimeNameWidget() {
  return (
    <BatchGeneratorWidget
      slug="anime-name-generator"
      generate={animeName}
      buttonLabel="Generate names"
      tip="Tip: each result pairs a Japanese-style given name with a surname. Perfect for OCs, role-play, and fan fiction. Hit Generate for more."
    />
  );
}
