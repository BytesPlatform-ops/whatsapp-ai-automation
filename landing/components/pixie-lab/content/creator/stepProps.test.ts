import { describe, it, expect } from 'vitest';
import type { WizardState } from '@/lib/pixie-lab/contentCreatorTypes';
import { staleGatesFor } from './stepProps';

function stateWithGates(gates: Partial<WizardState['gates']>): WizardState {
  return {
    tenant_id: 'ws', mock: true, dry_run: true, current_stage: 'idea_generation', complete: false,
    completed_count: 5, total_stages: 13, stages: [],
    gates: { idea: 'approved', script: 'approved', production: 'pending', publish: 'pending', ...gates },
    profile: null, profile_id: null, identity: null, identity_id: null, provider: null,
    ideas: [], approved_idea_id: null, scripts: [], approved_script_id: null, video: null,
    quality: null, posts: [], publish_job: null, metrics: [], learning: null,
  };
}

describe('staleGatesFor (upstream edit invalidation)', () => {
  it('reports only currently-approved downstream gates that an edit would reset', () => {
    // editing idea_generation invalidates idea+script+production+publish; only the
    // approved ones (idea, script) are "at risk"
    const s = stateWithGates({ idea: 'approved', script: 'approved', production: 'pending', publish: 'pending' });
    expect(staleGatesFor(s, 'idea_generation').sort()).toEqual(['idea', 'script']);
  });

  it('returns nothing when no downstream gate is approved yet', () => {
    const s = stateWithGates({ idea: 'pending', script: 'pending', production: 'pending', publish: 'pending' });
    expect(staleGatesFor(s, 'intake')).toEqual([]);
  });

  it('editing a script does not report the upstream idea gate', () => {
    const s = stateWithGates({ idea: 'approved', script: 'approved', production: 'approved', publish: 'pending' });
    // script_generation invalidates script+production+publish (NOT idea)
    expect(staleGatesFor(s, 'script_generation').sort()).toEqual(['production', 'script']);
  });
});
