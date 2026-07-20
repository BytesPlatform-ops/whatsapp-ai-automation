import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { STAGES, type CreatorStage, type StageStatus, type WizardState } from './contentCreatorTypes';

const getWizardState = vi.fn();
vi.mock('./contentCreatorClient', () => ({
  getWizardState: (...args: unknown[]) => getWizardState(...args),
}));

import { useCreatorWizard } from './useCreatorWizard';

function stateAt(current: CreatorStage): WizardState {
  const order = STAGES.map((s) => s.stage);
  const idx = order.indexOf(current);
  const stages = STAGES.map((s, i) => {
    const status: StageStatus = i < idx ? 'complete' : i === idx ? 'current' : 'locked';
    return { stage: s.stage, n: s.n, title: s.title, gate: s.gate, status, done: status === 'complete' };
  });
  return {
    tenant_id: 'ws', mock: true, dry_run: true, current_stage: current, complete: false,
    completed_count: idx, total_stages: 13, stages,
    gates: { idea: 'pending', script: 'pending', production: 'pending', publish: 'pending' },
    profile: null, profile_id: null, identity: null, identity_id: null, provider: null,
    ideas: [], approved_idea_id: null, scripts: [], approved_script_id: null, video: null,
    quality: null, posts: [], metrics: [], learning: null,
  };
}

beforeEach(() => getWizardState.mockReset());

describe('useCreatorWizard', () => {
  it('resumes on the backend current stage after load', async () => {
    getWizardState.mockResolvedValue({ ok: true, data: stateAt('script_generation') });
    const { result } = renderHook(() => useCreatorWizard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeStage).toBe('script_generation');
    expect(result.current.error).toBeNull();
  });

  it('surfaces an offline error', async () => {
    getWizardState.mockResolvedValue({ ok: false, error: { kind: 'offline', status: 503, message: 'offline' } });
    const { result } = renderHook(() => useCreatorWizard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.kind).toBe('offline');
    expect(result.current.state).toBeNull();
  });

  it('goTo allows completed stages but ignores locked ones', async () => {
    getWizardState.mockResolvedValue({ ok: true, data: stateAt('script_generation') });
    const { result } = renderHook(() => useCreatorWizard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.goTo('intake')); // completed → allowed
    expect(result.current.activeStage).toBe('intake');

    act(() => result.current.goTo('posting')); // locked → ignored
    expect(result.current.activeStage).toBe('intake');
  });
});
