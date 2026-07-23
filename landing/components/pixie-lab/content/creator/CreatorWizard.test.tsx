import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { STAGES, type CreatorStage, type StageStatus, type WizardState } from '@/lib/pixie-lab/contentCreatorTypes';

const getWizardState = vi.fn();
// The shell (via useCreatorWizard) and the step modules import from the client.
vi.mock('@/lib/pixie-lab/contentCreatorClient', () => ({
  getWizardState: (...a: unknown[]) => getWizardState(...a),
  // stubs so step modules import cleanly (never called during this render)
  createCreatorProfile: vi.fn(), invalidateFrom: vi.fn(), createIdentityFromCharacteristics: vi.fn(),
  connectProvider: vi.fn(), generateIdeas: vi.fn(), approveIdea: vi.fn(), rejectIdea: vi.fn(),
  generateScript: vi.fn(), approveScript: vi.fn(), rejectScript: vi.fn(), getCostEstimate: vi.fn(),
  approveProduction: vi.fn(), startVideoGeneration: vi.fn(), pollVideo: vi.fn(), runQualityCheck: vi.fn(),
  approvePublish: vi.fn(), schedulePosts: vi.fn(), syncAnalytics: vi.fn(),
}));

// PageKit pulls in server-ish helpers; stub to keep the test focused on the shell.
vi.mock('@/components/pixie-lab/PageKit', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeader: () => <div />,
  BackToDashboard: () => <a href="/pixie-lab/dashboard">Back to Dashboard</a>,
}));

import { CreatorWizard } from './CreatorWizard';

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
    quality: null, posts: [], publish_job: null, metrics: [], learning: null,
  };
}

beforeEach(() => getWizardState.mockReset());

describe('CreatorWizard shell', () => {
  it('renders all 13 stages and resumes on the current one', async () => {
    getWizardState.mockResolvedValue({ ok: true, data: stateAt('intake') });
    render(<CreatorWizard />);
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());

    const steps = screen.getByRole('navigation', { name: /Pipeline steps/i });
    expect(steps).toBeInTheDocument();
    // 13 step buttons
    expect(screen.getAllByRole('button').filter((b) => /^\d+\./.test(b.textContent || '')).length).toBe(13);
    // resumes on intake — the intake form is shown
    expect(screen.getByLabelText(/Business \/ creator name/i)).toBeInTheDocument();
    // mock badge is visible (honest mock labelling)
    expect(screen.getByText(/Demo · Mock mode/i)).toBeInTheDocument();
  });

  it('shows an offline error with retry when the backend is unreachable', async () => {
    getWizardState.mockResolvedValue({ ok: false, error: { kind: 'offline', status: 503, message: 'The content creator service is offline.' } });
    render(<CreatorWizard />);
    await waitFor(() => expect(screen.getByText(/service is offline/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });
});
