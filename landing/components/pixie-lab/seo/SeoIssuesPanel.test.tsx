import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// ── Mock seoApi using vi.fn() inside the factory (hoisting-safe) ───────────────
vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  seoApi: {
    listIssues: vi.fn(),
    resolveIssue: vi.fn(),
    prepareFix: vi.fn(),
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// Import after mocks are set up.
import { SeoIssuesPanel } from './SeoIssuesPanel';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoCrawlIssue } from '@/lib/pixie-lab/serviceTypes';

// Typed references to the mocked functions.
const listIssuesMock = vi.mocked(seoApi.listIssues);
const resolveIssueMock = vi.mocked(seoApi.resolveIssue);

const ISSUES: SeoCrawlIssue[] = [
  {
    id: 'i1',
    site_id: 's1',
    crawl_job_id: 'j1',
    rule_key: 'missing_title',
    category: 'on_page',
    severity: 'critical',
    status: 'open',
    recommendation: 'Add a unique title to this page.',
  },
  {
    id: 'i2',
    site_id: 's1',
    crawl_job_id: 'j1',
    rule_key: 'slow_response',
    category: 'performance',
    severity: 'high',
    status: 'open',
    recommendation: 'Reduce server response time.',
  },
  {
    id: 'i3',
    site_id: 's1',
    crawl_job_id: 'j1',
    rule_key: 'noindex_page',
    category: 'crawlability',
    severity: 'medium',
    status: 'resolved',
    recommendation: 'Remove noindex meta tag.',
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  listIssuesMock.mockResolvedValue({ backendUp: true, issues: ISSUES });
});

describe('SeoIssuesPanel — filters', () => {
  it('renders issues returned by the API', async () => {
    render(<SeoIssuesPanel />);
    await waitFor(() => expect(screen.getByText(/missing title/i)).toBeInTheDocument());
    expect(screen.getByText(/slow response/i)).toBeInTheDocument();
  });

  it('shows the correct issue count', async () => {
    render(<SeoIssuesPanel />);
    await waitFor(() => expect(screen.getByText(/3 issues/i)).toBeInTheDocument());
  });

  it('filters by search query (client-side)', async () => {
    render(<SeoIssuesPanel />);
    await waitFor(() => expect(screen.getByText(/missing title/i)).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText(/search issues/i);
    fireEvent.change(searchInput, { target: { value: 'slow' } });

    await waitFor(() => {
      expect(screen.getByText(/slow response/i)).toBeInTheDocument();
      expect(screen.queryByText(/missing title/i)).toBeNull();
    });
    expect(screen.getByText(/1 issue/i)).toBeInTheDocument();
  });

  it('shows severity chips for represented severities', async () => {
    render(<SeoIssuesPanel />);
    await waitFor(() => expect(screen.getByText(/1 critical/i)).toBeInTheDocument());
    expect(screen.getByText(/1 high/i)).toBeInTheDocument();
  });

  it('shows offline state when backendUp is false', async () => {
    listIssuesMock.mockResolvedValue({ backendUp: false });
    render(<SeoIssuesPanel />);
    await waitFor(() => expect(screen.getByText(/service is offline/i)).toBeInTheDocument());
  });

  it('shows empty state when no issues returned', async () => {
    listIssuesMock.mockResolvedValue({ backendUp: true, issues: [] });
    render(<SeoIssuesPanel />);
    await waitFor(() => expect(screen.getByText(/no issues found/i)).toBeInTheDocument());
  });
});

describe('SeoIssuesPanel — deep link params', () => {
  it('passes crawl_job_id to listIssues when provided', async () => {
    render(<SeoIssuesPanel initialCrawlJobId="job-42" />);
    await waitFor(() =>
      expect(listIssuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ crawl_job_id: 'job-42' }),
      ),
    );
  });

  it('passes site_id to listIssues when provided', async () => {
    render(<SeoIssuesPanel initialSiteId="site-99" />);
    await waitFor(() =>
      expect(listIssuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ site_id: 'site-99' }),
      ),
    );
  });

  it('passes initial severity filter to listIssues', async () => {
    render(<SeoIssuesPanel initialSeverity="critical" />);
    await waitFor(() =>
      expect(listIssuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ severity: 'critical' }),
      ),
    );
  });
});
