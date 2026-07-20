import { describe, it, expect } from 'vitest';
import { STAGES, STAGE_BY_KEY, GATES, INVALIDATES, type CreatorStage } from './contentCreatorTypes';

describe('content creator pipeline contract', () => {
  it('defines exactly the 13 backend stages in order', () => {
    expect(STAGES).toHaveLength(13);
    expect(STAGES.map((s) => s.stage)).toEqual([
      'intake', 'influencer_setup', 'provider_connection', 'idea_generation',
      'idea_approval', 'script_generation', 'script_approval', 'cost_estimate',
      'video_generation', 'quality_check', 'publish_approval', 'posting', 'analytics',
    ]);
    expect(STAGES.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('maps the four gates to the stages they occupy', () => {
    const gated = STAGES.filter((s) => s.gate).map((s) => [s.stage, s.gate]);
    expect(gated).toEqual([
      ['idea_approval', 'idea'],
      ['script_approval', 'script'],
      ['cost_estimate', 'production'],
      ['publish_approval', 'publish'],
    ]);
  });

  it('marks production as the only spend gate and video as the polling+cost stage', () => {
    expect(GATES.production.spend).toBe(true);
    expect(GATES.idea.spend).toBe(false);
    const video = STAGE_BY_KEY['video_generation'];
    expect(video.requiresPolling).toBe(true);
    expect(video.canIncurCost).toBe(true);
  });

  it('every stage has a lookup entry', () => {
    for (const s of STAGES) {
      expect(STAGE_BY_KEY[s.stage].n).toBe(s.n);
    }
  });

  it('invalidation only references real gate names', () => {
    const validGates = new Set(Object.keys(GATES));
    for (const gates of Object.values(INVALIDATES)) {
      for (const g of gates ?? []) expect(validGates.has(g)).toBe(true);
    }
    // editing intake invalidates all four gates
    expect(INVALIDATES['intake' as CreatorStage]).toEqual(['idea', 'script', 'production', 'publish']);
  });
});
