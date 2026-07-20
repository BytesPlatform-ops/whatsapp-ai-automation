'use client';

import type { CreatorStage } from '@/lib/pixie-lab/contentCreatorTypes';
import type { StepProps } from './stepProps';
import { StepIntake } from './StepIntake';
import { StepIdentity } from './StepIdentity';
import { StepProvider } from './StepProvider';
import { StepIdeas } from './StepIdeas';
import { StepIdeaApproval } from './StepIdeaApproval';
import { StepScript } from './StepScript';
import { StepScriptApproval } from './StepScriptApproval';
import { StepCost } from './StepCost';
import { StepVideo } from './StepVideo';
import { StepQuality } from './StepQuality';
import { StepPublish } from './StepPublish';
import { StepPosting } from './StepPosting';
import { StepAnalytics } from './StepAnalytics';

export const STEP_COMPONENTS: Record<CreatorStage, (p: StepProps) => JSX.Element> = {
  intake: StepIntake,
  influencer_setup: StepIdentity,
  provider_connection: StepProvider,
  idea_generation: StepIdeas,
  idea_approval: StepIdeaApproval,
  script_generation: StepScript,
  script_approval: StepScriptApproval,
  cost_estimate: StepCost,
  video_generation: StepVideo,
  quality_check: StepQuality,
  publish_approval: StepPublish,
  posting: StepPosting,
  analytics: StepAnalytics,
};
