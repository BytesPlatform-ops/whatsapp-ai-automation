'use client';

import { approvePublish } from '@/lib/pixie-lab/contentCreatorClient';
import { GatePanel } from './GatePanel';
import type { StepProps } from './stepProps';

/** Stage 11 — Gate 4 · Publish approval. Approve to unlock scheduling. Dry-run only. */
export function StepPublish({ state, advance }: StepProps) {
  const videoId = state.video?.id;
  const video = state.video?.video;

  return (
    <GatePanel
      title="Gate 4 · Publish approval"
      gate="publish"
      status={state.gates.publish}
      approveLabel="Approve publishing"
      whatSummary={
        <div>
          <p className="font-semibold">Approve the finished video for scheduling.</p>
          <p className="mt-1 text-xs text-[var(--pl-text-soft)]">Video status: {video?.status || 'unknown'}. Publishing is dry-run only until live publishing is enabled.</p>
        </div>
      }
      consequence="Approving unlocks scheduling. No post goes live while dry-run is enabled."
      onApprove={async () => {
        if (!videoId) return { kind: 'not_found', status: 404, message: 'No video to approve.' };
        const r = await approvePublish(videoId);
        if (!r.ok) return r.error;
        await advance();
        return null;
      }}
    />
  );
}
