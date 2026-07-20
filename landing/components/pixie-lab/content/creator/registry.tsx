'use client';

import type { CreatorStage } from '@/lib/pixie-lab/contentCreatorTypes';
import type { StepProps } from './stepProps';
import { StepCard } from './ui';
import { StepIntake } from './StepIntake';
import { StepIdentity } from './StepIdentity';
import { StepProvider } from './StepProvider';

function Placeholder({ title }: { title: string }) {
  return (
    <StepCard title={title} description="This step is being wired up.">
      <p className="text-sm text-[var(--pl-text-soft)]">Complete the earlier steps to continue.</p>
    </StepCard>
  );
}

export const STEP_COMPONENTS: Record<CreatorStage, (p: StepProps) => JSX.Element> = {
  intake: StepIntake,
  influencer_setup: StepIdentity,
  provider_connection: StepProvider,
  idea_generation: () => <Placeholder title="Idea generation" />,
  idea_approval: () => <Placeholder title="Gate 1 · Idea approval" />,
  script_generation: () => <Placeholder title="Script generation" />,
  script_approval: () => <Placeholder title="Gate 2 · Script approval" />,
  cost_estimate: () => <Placeholder title="Cost estimate · Gate 3" />,
  video_generation: () => <Placeholder title="Video generation" />,
  quality_check: () => <Placeholder title="Quality check" />,
  publish_approval: () => <Placeholder title="Gate 4 · Publish approval" />,
  posting: () => <Placeholder title="Posting" />,
  analytics: () => <Placeholder title="Analytics + learning" />,
};
