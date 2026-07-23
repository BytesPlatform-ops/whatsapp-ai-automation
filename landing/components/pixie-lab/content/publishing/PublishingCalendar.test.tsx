import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CalendarEvent, PublishJob } from '@/lib/pixie-lab/publishingClient';

// ── mock the client ──────────────────────────────────────────────────────────

const getCalendar = vi.fn();
const getJob = vi.fn();
const getAttempts = vi.fn();
const cancelJob = vi.fn();
const retryJob = vi.fn();
const rescheduleJob = vi.fn();
const runWorkerOnce = vi.fn();

vi.mock('@/lib/pixie-lab/publishingClient', () => ({
  getCalendar: (...a: unknown[]) => getCalendar(...a),
  getJob: (...a: unknown[]) => getJob(...a),
  getAttempts: (...a: unknown[]) => getAttempts(...a),
  cancelJob: (...a: unknown[]) => cancelJob(...a),
  retryJob: (...a: unknown[]) => retryJob(...a),
  rescheduleJob: (...a: unknown[]) => rescheduleJob(...a),
  runWorkerOnce: (...a: unknown[]) => runWorkerOnce(...a),
}));

import { PublishingCalendar } from './PublishingCalendar';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return an ISO string in the current month so the month grid chip renders it. */
function thisMonthIso(dayOfMonth = 15): string {
  const d = new Date();
  d.setDate(dayOfMonth);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function makeEvent(id: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const iso = thisMonthIso();
  return {
    id,
    scheduled_utc: iso,
    local_time: iso,
    timezone: 'UTC',
    platform: 'facebook',
    status: 'scheduled',
    source_product: 'content_agent',
    account_id: 'PAGE1',
    mode: 'dry_run',
    preview: `Preview ${id}`,
    content_format: 'text',
    attempt_count: 0,
    platform_post_id: '',
    platform_permalink: '',
    error_category: '',
    ...overrides,
  };
}

function makeJob(id: string, overrides: Partial<PublishJob> = {}): { id: string; job: PublishJob } {
  const iso = thisMonthIso();
  return {
    id,
    job: {
      source_product: 'content_agent',
      connection_id: 'facebook:P',
      platform: 'facebook',
      account_id: 'PAGE1',
      mode: 'dry_run',
      status: 'scheduled',
      snapshot: { text: `Caption for ${id}` },
      scheduled_utc: iso,
      local_time: iso,
      timezone: 'UTC',
      attempt_count: 0,
      max_attempts: 3,
      next_retry_utc: '',
      platform_post_id: '',
      platform_permalink: '',
      error_category: '',
      error_correlation_id: '',
      created_by: 'user@example.com',
      cancelled_by: '',
      created_at: iso,
      updated_at: iso,
      ...overrides,
    },
  };
}

function mockCalendar(events: CalendarEvent[]) {
  getCalendar.mockResolvedValue({ ok: true, data: { start: '', end: '', events } });
}

function mockJob(id: string, overrides: Partial<PublishJob> = {}) {
  const { job } = makeJob(id, overrides);
  getJob.mockResolvedValue({ ok: true, data: { id, job, attempts: [] } });
  getAttempts.mockResolvedValue({ ok: true, data: { job_id: id, attempts: [] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: three events within the current month
  mockCalendar([
    makeEvent('ev1', { platform: 'facebook', mode: 'dry_run', preview: 'Hello world' }),
    makeEvent('ev2', { platform: 'instagram', mode: 'live', preview: 'Insta post' }),
    makeEvent('ev3', { platform: 'facebook', mode: 'dry_run', platform_post_id: 'dryrun_abc123', preview: 'Dry run preview' }),
  ]);
  runWorkerOnce.mockResolvedValue({ ok: true, data: { count: 1, processed: [] } });
  cancelJob.mockResolvedValue({ ok: true, data: {} });
  retryJob.mockResolvedValue({ ok: true, data: {} });
  rescheduleJob.mockResolvedValue({ ok: true, data: {} });
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('PublishingCalendar — month grid', () => {
  it('renders events from getCalendar in the month grid', async () => {
    render(<PublishingCalendar />);
    // Events are in the current month grid; use findAllByText because both grid + narrow list may render
    expect(await screen.findAllByText('Hello world')).not.toHaveLength(0);
    expect(screen.getAllByText('Insta post')).not.toHaveLength(0);
  });

  it('shows loading spinner initially', () => {
    getCalendar.mockReturnValue(new Promise(() => {}));
    render(<PublishingCalendar />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows empty state when no events match', async () => {
    mockCalendar([]);
    render(<PublishingCalendar />);
    expect(await screen.findByText(/No events/i)).toBeInTheDocument();
  });

  it('shows error note on backend error', async () => {
    getCalendar.mockResolvedValue({ ok: false, error: { kind: 'server', status: 500, message: 'Service down' } });
    render(<PublishingCalendar />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Service down');
  });
});

describe('PublishingCalendar — view switching', () => {
  it('switches from Month to List view and renders list rows', async () => {
    render(<PublishingCalendar />);
    await screen.findAllByText('Hello world');

    fireEvent.click(screen.getByRole('tab', { name: /List/i }));
    // In list view events are rendered as clickable buttons with aria-label
    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: /Facebook.*Scheduled/i });
      expect(btns.length).toBeGreaterThan(0);
    });
  });

  it('switches to Week view and shows weekday headers', async () => {
    render(<PublishingCalendar />);
    await screen.findAllByText('Hello world');

    fireEvent.click(screen.getByRole('tab', { name: /Week/i }));
    // Wait for week view — contains day abbreviations
    await waitFor(() => {
      const text = document.body.textContent ?? '';
      // Week view shows current-week days; at least one of these will be present
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      expect(weekdays.some((d) => text.includes(d))).toBe(true);
    });
  });
});

describe('PublishingCalendar — platform filter', () => {
  it('hides non-matching events when platform filter is applied', async () => {
    render(<PublishingCalendar />);
    await screen.findAllByText('Hello world');

    // Switch to list for reliable single-element assertions
    fireEvent.click(screen.getByRole('tab', { name: /List/i }));
    await waitFor(() => expect(screen.getByText('Insta post')).toBeInTheDocument());

    // Filter to instagram only
    const select = screen.getByRole('combobox', { name: /Platform/i });
    fireEvent.change(select, { target: { value: 'instagram' } });

    await waitFor(() => {
      expect(screen.queryByText('Hello world')).not.toBeInTheDocument();
      expect(screen.getByText('Insta post')).toBeInTheDocument();
    });
  });
});

describe('PublishingCalendar — dry-run indicator', () => {
  it('shows dry-run badge for dry_run events in list view', async () => {
    render(<PublishingCalendar />);
    await screen.findAllByText('Hello world');

    fireEvent.click(screen.getByRole('tab', { name: /List/i }));

    await waitFor(() => {
      const dryRunBadges = screen.getAllByText('dry-run');
      expect(dryRunBadges.length).toBeGreaterThan(0);
    });
  });

  it('shows Simulated badge for dryrun_ post IDs in list view', async () => {
    render(<PublishingCalendar />);
    await screen.findAllByText('Hello world');

    fireEvent.click(screen.getByRole('tab', { name: /List/i }));

    await waitFor(() => {
      const simBadges = screen.getAllByText('Simulated');
      expect(simBadges.length).toBeGreaterThan(0);
    });
  });
});

describe('PublishingCalendar — drawer opens on event click', () => {
  it('opens the job detail drawer when a list row is clicked', async () => {
    mockJob('ev1');
    render(<PublishingCalendar />);
    await screen.findAllByText('Hello world');

    fireEvent.click(screen.getByRole('tab', { name: /List/i }));
    // Click first Facebook/Scheduled row
    const rows = await screen.findAllByRole('button', { name: /Facebook.*Scheduled/i });
    fireEvent.click(rows[0]);

    await waitFor(() => expect(getJob).toHaveBeenCalledWith('ev1'));
  });

  it('loads job data and shows caption in drawer after opening', async () => {
    mockJob('ev1');
    render(<PublishingCalendar />);
    await screen.findAllByText('Hello world');

    fireEvent.click(screen.getByRole('tab', { name: /List/i }));
    const rows = await screen.findAllByRole('button', { name: /Facebook.*Scheduled/i });
    fireEvent.click(rows[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Job details' })).toBeInTheDocument();
    });
    expect(await screen.findByText('Caption for ev1')).toBeInTheDocument();
  });

  it('closes the drawer when ESC is pressed', async () => {
    mockJob('ev1');
    render(<PublishingCalendar />);
    await screen.findAllByText('Hello world');

    fireEvent.click(screen.getByRole('tab', { name: /List/i }));
    const rows = await screen.findAllByRole('button', { name: /Facebook.*Scheduled/i });
    fireEvent.click(rows[0]);
    await screen.findByRole('dialog', { name: 'Job details' });

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Job details' })).not.toBeInTheDocument());
  });
});

describe('PublishingCalendar — run worker', () => {
  it('calls runWorkerOnce and then refetches when Run worker is clicked', async () => {
    render(<PublishingCalendar />);
    await screen.findAllByText('Hello world');

    const prevCount = getCalendar.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Run worker/i }));
    await waitFor(() => expect(runWorkerOnce).toHaveBeenCalled());
    await waitFor(() => expect(getCalendar.mock.calls.length).toBeGreaterThan(prevCount));
  });
});
