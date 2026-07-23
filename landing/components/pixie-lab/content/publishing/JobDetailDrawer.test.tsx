import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PublishJob } from '@/lib/pixie-lab/publishingClient';

// ── mock the client ──────────────────────────────────────────────────────────

const getJob = vi.fn();
const getAttempts = vi.fn();
const cancelJob = vi.fn();
const retryJob = vi.fn();
const rescheduleJob = vi.fn();

vi.mock('@/lib/pixie-lab/publishingClient', () => ({
  getJob: (...a: unknown[]) => getJob(...a),
  getAttempts: (...a: unknown[]) => getAttempts(...a),
  cancelJob: (...a: unknown[]) => cancelJob(...a),
  retryJob: (...a: unknown[]) => retryJob(...a),
  rescheduleJob: (...a: unknown[]) => rescheduleJob(...a),
}));

import { JobDetailDrawer } from './JobDetailDrawer';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<PublishJob> = {}): PublishJob {
  return {
    source_product: 'content_agent',
    connection_id: 'facebook:PAGE1',
    platform: 'facebook',
    account_id: 'PAGE1',
    mode: 'dry_run',
    status: 'scheduled',
    snapshot: {
      text: 'This is a safe caption',
      document_id: 'doc_abc',
      version_id: 'ver_1',
    },
    scheduled_utc: '2099-06-01T09:00:00Z',
    local_time: '2099-06-01T09:00:00',
    timezone: 'America/New_York',
    attempt_count: 1,
    max_attempts: 3,
    next_retry_utc: '',
    platform_post_id: '',
    platform_permalink: '',
    error_category: '',
    error_correlation_id: '',
    created_by: 'user@example.com',
    cancelled_by: '',
    created_at: '2099-01-01T00:00:00Z',
    updated_at: '2099-01-01T01:00:00Z',
    ...overrides,
  };
}

interface MockAttempt {
  id: string;
  attempt: {
    attempt_number: number;
    started_at: string;
    completed_at: string;
    result: string;
    simulated: boolean;
    platform_post_id: string;
    platform_request_id: string;
    error_category: string;
    error_correlation_id: string;
    retryable: boolean;
    response_meta: null;
  };
}

function makeAttempt(n: number, extra: Partial<MockAttempt['attempt']> = {}): MockAttempt {
  return {
    id: `att_${n}`,
    attempt: {
      attempt_number: n,
      started_at: '2099-06-01T09:00:01Z',
      completed_at: '2099-06-01T09:00:05Z',
      result: 'failed',
      simulated: false,
      platform_post_id: '',
      platform_request_id: `req_${n}`,
      error_category: 'rate_limited',
      error_correlation_id: '',
      retryable: true,
      response_meta: null,
      ...extra,
    },
  };
}

function mockJobOk(job: PublishJob) {
  getJob.mockResolvedValue({ ok: true, data: { id: 'job_1', job, attempts: [] } });
}

function mockAttemptsOk(attempts: MockAttempt[]) {
  getAttempts.mockResolvedValue({ ok: true, data: { job_id: 'job_1', attempts } });
}

const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockJobOk(makeJob());
  mockAttemptsOk([makeAttempt(1), makeAttempt(2, { result: 'success', error_category: '', retryable: false })]);
  cancelJob.mockResolvedValue({ ok: true, data: {} });
  retryJob.mockResolvedValue({ ok: true, data: {} });
  rescheduleJob.mockResolvedValue({ ok: true, data: {} });
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('JobDetailDrawer — rendering', () => {
  it('renders nothing when jobId is null', () => {
    render(<JobDetailDrawer jobId={null} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the drawer when jobId is set', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    expect(await screen.findByRole('dialog', { name: 'Job details' })).toBeInTheDocument();
  });

  it('shows safe fields: status, platform, timezone', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Job details' });

    expect(await screen.findByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Facebook')).toBeInTheDocument();
    expect(screen.getByText('America/New_York')).toBeInTheDocument();
  });

  it('shows the caption snapshot text', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    expect(await screen.findByText('This is a safe caption')).toBeInTheDocument();
  });

  it('shows created_by', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    expect(await screen.findByText('user@example.com')).toBeInTheDocument();
  });

  it('shows permalink link when present', async () => {
    mockJobOk(makeJob({ platform_permalink: 'https://facebook.com/post/1', status: 'published' }));
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Job details' });

    const link = await screen.findByRole('link', { name: /Open published post/i });
    expect(link).toHaveAttribute('href', 'https://facebook.com/post/1');
  });

  it('does NOT show permalink section when permalink is absent', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByText('This is a safe caption');
    expect(screen.queryByRole('link', { name: /Open published post/i })).not.toBeInTheDocument();
  });
});

describe('JobDetailDrawer — attempts timeline', () => {
  it('renders attempt numbers from getAttempts', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Job details' });

    expect(await screen.findByText('Attempt 1')).toBeInTheDocument();
    expect(screen.getByText('Attempt 2')).toBeInTheDocument();
  });

  it('shows error category from attempts', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByText('Attempt 1');
    expect(screen.getByText('Error: rate_limited')).toBeInTheDocument();
  });

  it('shows platform_request_id when present', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByText('Attempt 1');
    expect(screen.getByText('Request ID: req_1')).toBeInTheDocument();
  });

  it('shows "success" result on attempt 2', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByText('Attempt 2');
    expect(screen.getByText('success')).toBeInTheDocument();
  });
});

describe('JobDetailDrawer — actions', () => {
  it('shows Cancel button for active (scheduled) job', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Job details' });
    expect(await screen.findByRole('button', { name: /Cancel job/i })).toBeInTheDocument();
  });

  it('Cancel calls cancelJob then refetches', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Job details' });

    const btn = await screen.findByRole('button', { name: /Cancel job/i });
    fireEvent.click(btn);

    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith('job_1'));
    await waitFor(() => expect(getJob).toHaveBeenCalledTimes(2)); // initial + after cancel
  });

  it('shows Retry button for a failed (retryable) job', async () => {
    mockJobOk(makeJob({ status: 'failed' }));
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Job details' });

    expect(await screen.findByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('Retry calls retryJob then refetches', async () => {
    mockJobOk(makeJob({ status: 'failed' }));
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Job details' });

    const btn = await screen.findByRole('button', { name: /Retry/i });
    fireEvent.click(btn);

    await waitFor(() => expect(retryJob).toHaveBeenCalledWith('job_1'));
    await waitFor(() => expect(getJob).toHaveBeenCalledTimes(2));
  });

  it('shows reconnect link for reconnection_required status', async () => {
    mockJobOk(makeJob({ status: 'reconnection_required' }));
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Job details' });

    const link = await screen.findByRole('link', { name: /Settings.*Connections/i });
    expect(link).toHaveAttribute('href', '/pixie-lab/settings');
  });
});

describe('JobDetailDrawer — no token / no raw JSON leaks', () => {
  it('shows safe fields and does NOT render snapshot JSON dump', async () => {
    // The job has a snapshot but we must never see raw JSON like {"text":...}
    mockJobOk(makeJob({
      snapshot: {
        text: 'Safe caption text',
        document_id: 'doc_safe_id',
        // Deliberately no secret keys passed — the component must not dump raw snapshot
      },
    }));
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByText('Safe caption text');

    // Safe fields ARE visible (rendered as "Doc: doc_safe_id")
    expect(screen.getByText(/doc_safe_id/i)).toBeInTheDocument();

    // Raw JSON of snapshot must NOT be present
    const body = document.body.textContent ?? '';
    expect(body).not.toContain('{"text"');
    expect(body).not.toContain('"document_id"');

    // A fake secret token that was never passed must not appear
    expect(body).not.toContain('FAKE_SECRET_TOKEN_XYZ');
  });

  it('does not render response_meta JSON even when present in attempt', async () => {
    // Pass response_meta via attempt but we cast it as unknown and never render it
    mockAttemptsOk([
      {
        id: 'att_1',
        attempt: {
          attempt_number: 1,
          started_at: '2099-06-01T09:00:01Z',
          completed_at: '2099-06-01T09:00:05Z',
          result: 'failed',
          simulated: false,
          platform_post_id: '',
          platform_request_id: 'req_1',
          error_category: 'rate_limited',
          error_correlation_id: '',
          retryable: true,
          // Coerce: the actual type annotation says null, but send a fake response_meta
          response_meta: { Authorization: 'Bearer LEAKED_TOKEN' } as unknown as null,
        },
      },
    ]);
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByText('Attempt 1');

    const body = document.body.textContent ?? '';
    expect(body).not.toContain('LEAKED_TOKEN');
    expect(body).not.toContain('Authorization');
    expect(body).not.toContain('response_meta');
  });
});

describe('JobDetailDrawer — accessibility', () => {
  it('closes on ESC', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    await screen.findByRole('dialog', { name: 'Job details' });

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('has aria-modal on the dialog', async () => {
    render(<JobDetailDrawer jobId="job_1" onClose={onClose} />);
    const dialog = await screen.findByRole('dialog', { name: 'Job details' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
