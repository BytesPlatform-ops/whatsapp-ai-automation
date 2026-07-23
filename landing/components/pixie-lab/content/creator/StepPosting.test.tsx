import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WizardState, PublishJobRef } from '@/lib/pixie-lab/contentCreatorTypes';

const listConnections = vi.fn();
const createPublishJob = vi.fn();
const getPublishingConfig = vi.fn();
const cancelJob = vi.fn();
const retryJob = vi.fn();
const rescheduleJob = vi.fn();
const runWorkerOnce = vi.fn();

vi.mock('@/lib/pixie-lab/publishingClient', () => ({
  listConnections: (...a: unknown[]) => listConnections(...a),
  createPublishJob: (...a: unknown[]) => createPublishJob(...a),
  getPublishingConfig: (...a: unknown[]) => getPublishingConfig(...a),
  cancelJob: (...a: unknown[]) => cancelJob(...a),
  retryJob: (...a: unknown[]) => retryJob(...a),
  rescheduleJob: (...a: unknown[]) => rescheduleJob(...a),
  runWorkerOnce: (...a: unknown[]) => runWorkerOnce(...a),
}));

import { StepPosting } from './StepPosting';

const CONN = {
  connection_id: 'facebook:PAGE1', platform: 'facebook', account_id: 'PAGE1', page_id: 'PAGE1',
  display_name: 'Test Page', scopes: [], publishing_authorized: true, reconnection_required: false,
  capabilities: { platform: 'facebook', live_capable: true, publishing_authorized: true, missing_scopes: [],
    reconnection_required: false, formats_supported: { video: true, reel: true }, scheduling: true,
    limits: { max_media: 10, caption_limit: 2200, aspect_ratios: [], formats: [] } },
};

function baseState(over: Partial<WizardState> = {}): WizardState {
  return {
    tenant_id: 'ws', mock: true, dry_run: true, current_stage: 'posting', complete: false,
    completed_count: 11, total_stages: 13, stages: [],
    gates: { idea: 'approved', script: 'approved', production: 'approved', publish: 'approved' },
    profile: null, profile_id: null, identity: null, identity_id: null, provider: null,
    ideas: [], approved_idea_id: null, scripts: [], approved_script_id: null,
    video: { id: 'vid_1', video: { status: 'ready', asset_ref: 'asset_1' } as never },
    quality: null, posts: [], publish_job: null, metrics: [], learning: null,
    ...over,
  };
}

function job(over: Partial<PublishJobRef> = {}): PublishJobRef {
  return {
    id: 'pubjob_1', source_product: 'ai_influencer', connection_id: 'facebook:PAGE1', platform: 'facebook',
    account_id: 'PAGE1', mode: 'dry_run', status: 'scheduled', scheduled_utc: '2099-01-01T09:00:00+00:00',
    local_time: '2099-01-01T09:00:00', timezone: 'UTC', attempt_count: 0, max_attempts: 3, next_retry_utc: '',
    platform_post_id: '', platform_permalink: '', error_category: '', error_correlation_id: '',
    created_at: '', updated_at: '', ...over,
  };
}

const props = (state: WizardState) => ({
  state, reload: vi.fn().mockResolvedValue(null), advance: vi.fn().mockResolvedValue(undefined), goTo: vi.fn(),
});

beforeEach(() => {
  [listConnections, createPublishJob, getPublishingConfig, cancelJob, retryJob, rescheduleJob, runWorkerOnce]
    .forEach((f) => f.mockReset());
  getPublishingConfig.mockResolvedValue({ ok: true, data: { live_allowed: false } });
  listConnections.mockResolvedValue({ ok: true, data: { connections: [CONN] } });
});

describe('StepPosting — create form', () => {
  it('blocks publishing when Gate 4 is not approved', () => {
    render(<StepPosting {...props(baseState({ gates: { idea: 'approved', script: 'approved', production: 'approved', publish: 'pending' } }))} />);
    expect(screen.getByText(/Gate 4 \(publish approval\) is required/i)).toBeInTheDocument();
    expect(listConnections).not.toHaveBeenCalled();
  });

  it('warns when the video is not ready', () => {
    render(<StepPosting {...props(baseState({ video: { id: 'vid_1', video: { status: 'generating' } as never } }))} />);
    expect(screen.getByText(/isn’t ready yet/i)).toBeInTheDocument();
  });

  it('loads video-capable destinations', async () => {
    render(<StepPosting {...props(baseState())} />);
    expect(await screen.findByText(/Facebook · Test Page/i)).toBeInTheDocument();
  });

  it('creates a dry-run publish-now job after confirmation, then reloads', async () => {
    createPublishJob.mockResolvedValue({ ok: true, data: { id: 'pubjob_1', created: true } });
    const p = props(baseState());
    render(<StepPosting {...p} />);
    fireEvent.click(await screen.findByLabelText(/Facebook · Test Page/i));
    fireEvent.click(screen.getByRole('button', { name: /Publish now/i }));
    // requires an explicit confirm
    const confirm = await screen.findByRole('button', { name: /Confirm publish/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(createPublishJob).toHaveBeenCalled());
    const args = createPublishJob.mock.calls[0][0];
    expect(args).toMatchObject({ sourceProduct: 'ai_influencer', connectionId: 'facebook:PAGE1',
      influencerVideoId: 'vid_1', mode: 'dry_run', confirm: true });
    expect(args.scheduledLocal).toBeFalsy();
    await waitFor(() => expect(p.reload).toHaveBeenCalled());
  });

  it('surfaces a gate_blocked backend error without reloading', async () => {
    createPublishJob.mockResolvedValue({ ok: false, error: { kind: 'gate_blocked', status: 409, message: 'Gate 4 required' } });
    const p = props(baseState());
    render(<StepPosting {...p} />);
    fireEvent.click(await screen.findByLabelText(/Facebook · Test Page/i));
    fireEvent.click(screen.getByRole('button', { name: /Publish now/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirm publish/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gate 4 required');
    expect(p.reload).not.toHaveBeenCalled();
  });
});

describe('StepPosting — recovered job', () => {
  it('shows the existing job instead of the form (no duplicate)', () => {
    render(<StepPosting {...props(baseState({ publish_job: job() }))} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publish now/i })).not.toBeInTheDocument();
    expect(listConnections).not.toHaveBeenCalled();
  });

  it('labels a simulated dry-run post id', () => {
    render(<StepPosting {...props(baseState({ publish_job: job({ status: 'published', platform_post_id: 'dryrun_abc123' }) }))} />);
    expect(screen.getByText(/Published \(simulated dry-run\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Simulated/i).length).toBeGreaterThan(0);
  });

  it('renders a permalink when present', () => {
    render(<StepPosting {...props(baseState({ publish_job: job({ status: 'published', platform_permalink: 'https://facebook.com/1' }) }))} />);
    expect(screen.getByRole('link', { name: /Open published post/i })).toHaveAttribute('href', 'https://facebook.com/1');
  });

  it('cancels an active job then reloads', async () => {
    cancelJob.mockResolvedValue({ ok: true, data: {} });
    const p = props(baseState({ publish_job: job() }));
    render(<StepPosting {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith('pubjob_1'));
    await waitFor(() => expect(p.reload).toHaveBeenCalled());
  });

  it('offers retry and reconnection guidance for a reconnection-required job', () => {
    render(<StepPosting {...props(baseState({ publish_job: job({ status: 'reconnection_required' }) }))} />);
    expect(screen.getByText(/needs reconnecting/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });
});
