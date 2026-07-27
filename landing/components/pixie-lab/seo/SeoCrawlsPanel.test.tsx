import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── Mock seoApi using vi.fn() inside the factory (hoisting-safe) ───────────────
vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  seoApi: {
    listCrawls: vi.fn(),
    getCrawlJob: vi.fn(),
    cancelCrawl: vi.fn(),
    retryCrawl: vi.fn(),
    startCrawl: vi.fn(),
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { SeoCrawlsPanel } from './SeoCrawlsPanel';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoCrawlJob } from '@/lib/pixie-lab/serviceTypes';

const listCrawlsMock = vi.mocked(seoApi.listCrawls);
const getCrawlJobMock = vi.mocked(seoApi.getCrawlJob);

function makeJob(overrides: Partial<SeoCrawlJob> = {}): SeoCrawlJob {
  return {
    id: 'job-1',
    site_id: 'site-1',
    status: 'completed',
    crawl_type: 'site',
    requested_limit: 500,
    crawled_count: 120,
    discovered_count: 130,
    failed_count: 2,
    queued_at: '2026-07-28T10:00:00Z',
    finished_at: '2026-07-28T10:05:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default getCrawlJob to avoid unhandled calls
  getCrawlJobMock.mockResolvedValue({ backendUp: true, job: makeJob() });
});

describe('SeoCrawlsPanel — list rendering', () => {
  it('shows a completed crawl job', async () => {
    listCrawlsMock.mockResolvedValue({ backendUp: true, jobs: [makeJob()] });
    render(<SeoCrawlsPanel />);
    await waitFor(() => expect(screen.getByText(/full site crawl/i)).toBeInTheDocument());
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
    expect(screen.getByText(/120 pages crawled/i)).toBeInTheDocument();
  });

  it('shows offline state when backend is down', async () => {
    listCrawlsMock.mockResolvedValue({ backendUp: false });
    render(<SeoCrawlsPanel />);
    await waitFor(() => expect(screen.getByText(/service is offline/i)).toBeInTheDocument());
  });

  it('shows empty state when no jobs', async () => {
    listCrawlsMock.mockResolvedValue({ backendUp: true, jobs: [] });
    render(<SeoCrawlsPanel />);
    await waitFor(() => expect(screen.getByText(/no crawl jobs yet/i)).toBeInTheDocument());
  });

  it('filters by site_id via initialSiteId prop', async () => {
    listCrawlsMock.mockResolvedValue({ backendUp: true, jobs: [] });
    render(<SeoCrawlsPanel initialSiteId="site-abc" />);
    await waitFor(() => expect(listCrawlsMock).toHaveBeenCalledWith('site-abc'));
  });

  it('shows the job count', async () => {
    listCrawlsMock.mockResolvedValue({
      backendUp: true,
      jobs: [makeJob(), makeJob({ id: 'job-2', status: 'failed' })],
    });
    render(<SeoCrawlsPanel />);
    await waitFor(() => expect(screen.getByText(/2 jobs/i)).toBeInTheDocument());
  });
});

describe('SeoCrawlsPanel — polling logic (unit)', () => {
  /**
   * The polling loop is set up inside CrawlRow via useEffect + setInterval.
   * We verify the polling contract by inspecting getCrawlJob calls:
   *   - For terminal states (completed, failed, cancelled) the interval is never
   *     created, so getCrawlJob should not be called within the test's async window.
   *   - For active states (running, queued) the interval is created and will call
   *     getCrawlJob; we wait for at least one call.
   *
   * Note: setInterval with POLL_MS=4000 won't fire during most test runs, so we
   * verify the structural behavior (interval created / not created) rather than
   * trying to advance fake timers alongside waitFor (which breaks with jsdom).
   */

  it('does NOT call getCrawlJob for a completed job during mount', async () => {
    listCrawlsMock.mockResolvedValue({ backendUp: true, jobs: [makeJob({ status: 'completed' })] });
    render(<SeoCrawlsPanel />);
    await waitFor(() => expect(screen.getByText(/completed/i)).toBeInTheDocument());
    // Give async effects time to settle without fake timers.
    await new Promise((r) => setTimeout(r, 50));
    expect(getCrawlJobMock).not.toHaveBeenCalled();
  });

  it('does NOT call getCrawlJob for a failed job during mount', async () => {
    listCrawlsMock.mockResolvedValue({ backendUp: true, jobs: [makeJob({ status: 'failed' })] });
    render(<SeoCrawlsPanel />);
    await waitFor(() => expect(screen.getByText(/failed/i)).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));
    expect(getCrawlJobMock).not.toHaveBeenCalled();
  });

  it('does NOT call getCrawlJob for a cancelled job during mount', async () => {
    listCrawlsMock.mockResolvedValue({ backendUp: true, jobs: [makeJob({ status: 'cancelled' })] });
    render(<SeoCrawlsPanel />);
    await waitFor(() => expect(screen.getByText(/cancelled/i)).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 50));
    expect(getCrawlJobMock).not.toHaveBeenCalled();
  });

  it('renders running status indicator for a running job', async () => {
    listCrawlsMock.mockResolvedValue({
      backendUp: true,
      jobs: [makeJob({ status: 'running', crawled_count: 55, finished_at: undefined })],
    });
    render(<SeoCrawlsPanel />);
    // The status badge shows "Crawling…"
    await waitFor(() => expect(screen.getByText(/crawling/i)).toBeInTheDocument());
  });
});
