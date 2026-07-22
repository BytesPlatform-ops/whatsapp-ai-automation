import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getPublishingConfig = vi.fn();
const listConnections = vi.fn();
const createPublishJob = vi.fn();
vi.mock('@/lib/pixie-lab/publishingClient', () => ({
  getPublishingConfig: (...a: unknown[]) => getPublishingConfig(...a),
  listConnections: (...a: unknown[]) => listConnections(...a),
  createPublishJob: (...a: unknown[]) => createPublishJob(...a),
}));

import { PublishDialog } from './PublishDialog';

function conn(authorized = true) {
  return {
    connection_id: 'facebook:PAGE1', platform: 'facebook', account_id: 'PAGE1', page_id: 'PAGE1',
    display_name: 'Test Page', scopes: [], publishing_authorized: authorized, reconnection_required: !authorized,
    capabilities: { platform: 'facebook', live_capable: true, publishing_authorized: authorized, missing_scopes: authorized ? [] : ['pages_manage_posts'],
      reconnection_required: !authorized, formats_supported: { text: true, image: true }, limits: { max_media: 10, caption_limit: 100, aspect_ratios: [], formats: [] }, scheduling: true },
  };
}

const base = () => ({
  open: true, onClose: vi.fn(), sourceProduct: 'content_agent' as const, contentFormat: 'text' as const,
  text: 'hello world', documentId: 'd1', versionId: 'v1',
});

beforeEach(() => {
  getPublishingConfig.mockResolvedValue({ ok: true, data: { publish_mode: 'dry_run', meta_publish_enabled: false, live_allowed: false, worker_enabled: false, default_timezone: 'UTC', max_retries: 3 } });
  listConnections.mockResolvedValue({ ok: true, data: { connections: [conn()] } });
  createPublishJob.mockResolvedValue({ ok: true, data: { id: 'job1', job: {}, created: true } });
});

describe('PublishDialog', () => {
  it('renders destinations and a dry-run badge when live is disabled', async () => {
    render(<PublishDialog {...base()} />);
    expect(await screen.findByText('Test Page (facebook)')).toBeInTheDocument();
    expect(screen.getByText(/Dry run/i)).toBeInTheDocument();
    expect(screen.getByText(/Live publishing is disabled/i)).toBeInTheDocument();
  });

  it('creates a dry-run job on submit', async () => {
    render(<PublishDialog {...base()} />);
    await screen.findByText('Test Page (facebook)');
    fireEvent.click(screen.getByRole('button', { name: /Queue dry-run/i }));
    await waitFor(() => expect(createPublishJob).toHaveBeenCalled());
    expect(createPublishJob.mock.calls[0][0]).toMatchObject({ mode: 'dry_run', connectionId: 'facebook:PAGE1', sourceProduct: 'content_agent' });
    expect(await screen.findByText(/Queued \(dry-run\)/i)).toBeInTheDocument();
  });

  it('surfaces a gate error', async () => {
    createPublishJob.mockResolvedValue({ ok: false, error: { kind: 'gate_blocked', status: 409, message: 'Gate 4 required.' } });
    render(<PublishDialog {...base()} sourceProduct="ai_influencer" />);
    await screen.findByText('Test Page (facebook)');
    fireEvent.click(screen.getByRole('button', { name: /Queue dry-run/i }));
    expect(await screen.findByText(/Gate 4 required/i)).toBeInTheDocument();
  });

  it('shows the schedule fields when scheduling', async () => {
    render(<PublishDialog {...base()} />);
    await screen.findByText('Test Page (facebook)');
    fireEvent.click(screen.getByRole('button', { name: /Schedule/i }));
    expect(screen.getByLabelText(/Date and time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Timezone/i)).toBeInTheDocument();
  });

  it('offers a live toggle when live is allowed and account authorized', async () => {
    getPublishingConfig.mockResolvedValue({ ok: true, data: { publish_mode: 'live', meta_publish_enabled: true, live_allowed: true, worker_enabled: false, default_timezone: 'UTC', max_retries: 3 } });
    render(<PublishDialog {...base()} />);
    await screen.findByText('Test Page (facebook)');
    expect(screen.getByText(/Publish live/i)).toBeInTheDocument();
  });
});
