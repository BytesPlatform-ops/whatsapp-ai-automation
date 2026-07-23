import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WizardState } from '@/lib/pixie-lab/contentCreatorTypes';

const createCreatorProfile = vi.fn();
const invalidateFrom = vi.fn();
vi.mock('@/lib/pixie-lab/contentCreatorClient', () => ({
  createCreatorProfile: (...a: unknown[]) => createCreatorProfile(...a),
  invalidateFrom: (...a: unknown[]) => invalidateFrom(...a),
}));

import { StepIntake } from './StepIntake';

function baseState(profile: WizardState['profile'] = null): WizardState {
  return {
    tenant_id: 'ws', mock: true, dry_run: true, current_stage: 'intake', complete: false,
    completed_count: 0, total_stages: 13, stages: [],
    gates: { idea: 'pending', script: 'pending', production: 'pending', publish: 'pending' },
    profile, profile_id: null, identity: null, identity_id: null, provider: null,
    ideas: [], approved_idea_id: null, scripts: [], approved_script_id: null, video: null,
    quality: null, posts: [], publish_job: null, metrics: [], learning: null,
  };
}

const props = () => ({ state: baseState(), reload: vi.fn().mockResolvedValue(null), advance: vi.fn().mockResolvedValue(undefined), goTo: vi.fn() });

beforeEach(() => { createCreatorProfile.mockReset(); invalidateFrom.mockReset(); });

describe('StepIntake', () => {
  it('renders an empty intake form', () => {
    render(<StepIntake {...props()} />);
    expect(screen.getByLabelText(/Business \/ creator name/i)).toBeInTheDocument();
  });

  it('shows a validation error and does not submit when business name is empty', async () => {
    render(<StepIntake {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Business name is required/i);
    expect(createCreatorProfile).not.toHaveBeenCalled();
  });

  it('submits the profile and advances on success', async () => {
    createCreatorProfile.mockResolvedValue({ ok: true, data: { id: 'p1', profile: {} } });
    const p = props();
    render(<StepIntake {...p} />);
    fireEvent.change(screen.getByLabelText(/Business \/ creator name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));
    await waitFor(() => expect(createCreatorProfile).toHaveBeenCalled());
    expect(createCreatorProfile.mock.calls[0][0]).toMatchObject({ business_name: 'Acme' });
    await waitFor(() => expect(p.advance).toHaveBeenCalled());
  });

  it('surfaces a backend error without advancing', async () => {
    createCreatorProfile.mockResolvedValue({ ok: false, error: { kind: 'server', status: 500, message: 'boom' } });
    const p = props();
    render(<StepIntake {...p} />);
    fireEvent.change(screen.getByLabelText(/Business \/ creator name/i), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(p.advance).not.toHaveBeenCalled();
  });
});
