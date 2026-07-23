import { describe, it, expect } from 'vitest';
import { STAGES, type CreatorStage, type StageStatus, type WizardState } from './contentCreatorTypes';
import { isNavigable, resumeStage, progressPercent, nextStage, prevStage, furthestCompletedN } from './wizardNav';

/** Build a WizardState where stages up to `current` are complete, `current` is
 *  current, and the rest are locked. */
function makeState(current: CreatorStage, overrides: Partial<Record<CreatorStage, StageStatus>> = {}): WizardState {
  const order = STAGES.map((s) => s.stage);
  const curIdx = order.indexOf(current);
  const stages = STAGES.map((s, i) => {
    let status: StageStatus = i < curIdx ? 'complete' : i === curIdx ? 'current' : 'locked';
    if (overrides[s.stage]) status = overrides[s.stage]!;
    return { stage: s.stage, n: s.n, title: s.title, gate: s.gate, status, done: status === 'complete' };
  });
  return {
    tenant_id: 'ws_x', mock: true, dry_run: true, current_stage: current, complete: false,
    completed_count: stages.filter((s) => s.done).length, total_stages: 13, stages,
    gates: { idea: 'pending', script: 'pending', production: 'pending', publish: 'pending' },
    profile: null, profile_id: null, identity: null, identity_id: null, provider: null,
    ideas: [], approved_idea_id: null, scripts: [], approved_script_id: null, video: null,
    quality: null, posts: [], publish_job: null, metrics: [], learning: null,
  };
}

describe('wizardNav', () => {
  it('allows navigating to completed and current stages but not locked ones', () => {
    const s = makeState('script_generation');
    expect(isNavigable(s, 'intake')).toBe(true); // completed
    expect(isNavigable(s, 'script_generation')).toBe(true); // current
    expect(isNavigable(s, 'video_generation')).toBe(false); // locked — cannot skip
  });

  it('resumes on the current stage when navigable', () => {
    expect(resumeStage(makeState('cost_estimate'))).toBe('cost_estimate');
  });

  it('falls back to the last completed stage when current is not navigable', () => {
    const s = makeState('idea_generation', { idea_generation: 'locked' });
    // current_stage points at a locked stage → resume clamps to last completed
    expect(resumeStage(s)).toBe('provider_connection');
  });

  it('falls back to the first stage for a fresh pipeline', () => {
    const s = makeState('intake', { intake: 'current' });
    expect(resumeStage(s)).toBe('intake');
  });

  it('computes progress percent from completed_count', () => {
    expect(progressPercent(makeState('intake'))).toBe(0);
    expect(progressPercent(makeState('video_generation'))).toBe(Math.round((8 / 13) * 100));
  });

  it('walks next/prev in the real 13-stage order', () => {
    expect(nextStage('intake')).toBe('influencer_setup');
    expect(prevStage('influencer_setup')).toBe('intake');
    expect(nextStage('analytics')).toBeNull();
    expect(prevStage('intake')).toBeNull();
  });

  it('reports the furthest completed stage number', () => {
    expect(furthestCompletedN(makeState('quality_check'))).toBe(9);
  });
});
