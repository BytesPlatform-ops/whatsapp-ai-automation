import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PublishJob } from '@/lib/pixie-lab/publishingClient';

const listJobs = vi.fn();
const getPublishingConfig = vi.fn();
const cancelJob = vi.fn();
const retryJob = vi.fn();
const runWorkerOnce = vi.fn();
vi.mock('@/lib/pixie-lab/publishingClient', () => ({
  listJobs: (...a: unknown[]) => listJobs(...a),
  getPublishingConfig: (...a: unknown[]) => getPublishingConfig(...a),
  cancelJob: (...a: unknown[]) => cancelJob(...a),
  retryJob: (...a: unknown[]) => retryJob(...a),
  runWorkerOnce: (...a: unknown[]) => runWorkerOnce(...a),
}));

import { PublishingQueue } from './PublishingQueue';

function job(id: string, status: PublishJob['status'], extra: Partial<PublishJob> = {}): { id: string; job: PublishJob } {
  return { id, job: {
    source_product: 'content_agent', connection_id: 'facebook:P', platform: 'facebook', account_id: 'P',
    mode: 'dry_run', status, snapshot: { text: `text ${id}` }, scheduled_utc: '2099-01-01T00:00:00+00:00',
    local_time: '', timezone: 'UTC', attempt_count: 0, max_attempts: 3, next_retry_utc: '',
    platform_post_id: '', platform_permalink: '', error_category: '', error_correlation_id: '',
    created_by: '', cancelled_by: '', created_at: '', updated_at: '', ...extra,
  } };
}

beforeEach(() => {
  getPublishingConfig.mockResolvedValue({ ok: true, data: { publish_mode: 'dry_run', meta_publish_enabled: false, live_allowed: false, worker_enabled: false, default_timezone: 'UTC', max_retries: 3 } });
  listJobs.mockResolvedValue({ ok: true, data: { jobs: [job('j1', 'scheduled'), job('j2', 'failed', { error_category: 'rate_limited', attempt_count: 1 })] } });
  cancelJob.mockResolvedValue({ ok: true, data: { id: 'j1', job: {} } });
  retryJob.mockResolvedValue({ ok: true, data: { id: 'j2', job: {} } });
  runWorkerOnce.mockResolvedValue({ ok: true, data: { count: 1, processed: [] } });
});

describe('PublishingQueue', () => {
  it('lists jobs with status', async () => {
    render(<PublishingQueue />);
    expect(await screen.findByText('text j1')).toBeInTheDocument();  // job preview (unique)
    expect(screen.getByText('text j2')).toBeInTheDocument();
    expect(screen.getByText('Dry-run only')).toBeInTheDocument();     // config badge
    expect(screen.getByLabelText('Cancel job')).toBeInTheDocument();  // scheduled job → cancel
  });

  it('filters by status', async () => {
    render(<PublishingQueue />);
    await screen.findByText('Scheduled');
    fireEvent.click(screen.getByRole('button', { name: /^Failed$/i }));
    await waitFor(() => expect(listJobs.mock.calls.some((c) => c[0]?.status === 'failed')).toBe(true));
  });

  it('cancels a scheduled job', async () => {
    render(<PublishingQueue />);
    await screen.findByText('Scheduled');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel job' }));
    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith('j1'));
  });

  it('retries a failed job', async () => {
    render(<PublishingQueue />);
    await screen.findByText('Failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry job' }));
    await waitFor(() => expect(retryJob).toHaveBeenCalledWith('j2'));
  });

  it('runs the worker once', async () => {
    render(<PublishingQueue />);
    await screen.findByText('Scheduled');
    fireEvent.click(screen.getByRole('button', { name: /Run worker/i }));
    await waitFor(() => expect(runWorkerOnce).toHaveBeenCalled());
  });

  it('shows an empty state', async () => {
    listJobs.mockResolvedValue({ ok: true, data: { jobs: [] } });
    render(<PublishingQueue />);
    expect(await screen.findByText(/No publish jobs/i)).toBeInTheDocument();
  });
});
