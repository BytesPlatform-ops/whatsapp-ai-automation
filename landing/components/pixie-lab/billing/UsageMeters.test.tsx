import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageMeters } from './UsageMeters';
import type { UsageResponse } from '@/lib/pixie-lab/billingClient';

function makeUsage(
  counters: UsageResponse['counters'],
  fallback = false,
): UsageResponse {
  return {
    period: {
      start: '2026-07-01T00:00:00Z',
      end: '2026-07-31T23:59:59Z',
      fallback,
    },
    counters,
  };
}

describe('UsageMeters', () => {
  it('renders a progressbar for each finite-limit counter', () => {
    const usage = makeUsage([
      { key: 'content_generations', used: 10, limit: 50, remaining: 40 },
      { key: 'publish_jobs', used: 3, limit: 20, remaining: 17 },
    ]);
    render(<UsageMeters usage={usage} />);
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(2);
  });

  it('sets aria-valuenow, aria-valuemin and aria-valuemax on progressbars', () => {
    const usage = makeUsage([
      { key: 'content_generations', used: 15, limit: 50, remaining: 35 },
    ]);
    render(<UsageMeters usage={usage} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '15');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '50');
  });

  it('does NOT render a progressbar for unlimited counters (limit = -1)', () => {
    const usage = makeUsage([
      { key: 'publish_jobs', used: 5, limit: -1, remaining: -1 },
    ]);
    render(<UsageMeters usage={usage} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows "Unlimited" for counters with limit = -1', () => {
    const usage = makeUsage([
      { key: 'publish_jobs', used: 5, limit: -1, remaining: -1 },
    ]);
    render(<UsageMeters usage={usage} />);
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it('shows both finite and unlimited counters in the same list', () => {
    const usage = makeUsage([
      { key: 'content_generations', used: 5, limit: 50, remaining: 45 },
      { key: 'publish_jobs', used: 100, limit: -1, remaining: -1 },
    ]);
    render(<UsageMeters usage={usage} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument(); // finite counter
    expect(screen.getByText('Unlimited')).toBeInTheDocument();   // unlimited counter
  });

  it('shows "current billing period" label when fallback is false', () => {
    const usage = makeUsage([], false);
    render(<UsageMeters usage={usage} />);
    expect(screen.getByText('Current billing period')).toBeInTheDocument();
  });

  it('shows "Fallback monthly period" label when fallback is true', () => {
    const usage = makeUsage([], true);
    render(<UsageMeters usage={usage} />);
    expect(screen.getByText('Fallback monthly period')).toBeInTheDocument();
  });

  it('shows "No usage data" when counters array is empty', () => {
    render(<UsageMeters usage={makeUsage([])} />);
    expect(screen.getByText(/No usage data/i)).toBeInTheDocument();
  });

  it('uses human-readable labels for known keys', () => {
    const usage = makeUsage([
      { key: 'content_generations', used: 2, limit: 10, remaining: 8 },
    ]);
    render(<UsageMeters usage={usage} />);
    expect(screen.getByText('Content generations')).toBeInTheDocument();
  });

  it('has accessible aria-label on each progressbar', () => {
    const usage = makeUsage([
      { key: 'seo_audits', used: 3, limit: 10, remaining: 7 },
    ]);
    render(<UsageMeters usage={usage} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-label');
    expect(bar.getAttribute('aria-label')).toMatch(/3 of 10 used/i);
  });
});
