import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { CalendarEvent } from '@/lib/pixie-lab/publishingClient';

// ── mock the client ──────────────────────────────────────────────────────────

const getCalendar = vi.fn();
vi.mock('@/lib/pixie-lab/publishingClient', () => ({
  getCalendar: (...a: unknown[]) => getCalendar(...a),
}));

import { usePublishingCalendar } from './usePublishingCalendar';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEvent(id: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    scheduled_utc: '2099-03-15T09:00:00+00:00',
    local_time: '2099-03-15T09:00:00',
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

const EVENT_FB = makeEvent('ev1', { platform: 'facebook', status: 'scheduled', source_product: 'content_agent' });
const EVENT_IG = makeEvent('ev2', { platform: 'instagram', status: 'published', source_product: 'ai_influencer' });
const EVENT_CANCELLED = makeEvent('ev3', { platform: 'facebook', status: 'cancelled' });

function mockOk(events: CalendarEvent[]) {
  getCalendar.mockResolvedValue({ ok: true, data: { start: '', end: '', events } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOk([EVENT_FB, EVENT_IG, EVENT_CANCELLED]);
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('usePublishingCalendar — initial fetch', () => {
  it('calls getCalendar with a bounded start/end range on mount', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getCalendar).toHaveBeenCalledTimes(1);
    const [q] = getCalendar.mock.calls[0] as [{ start?: string; end?: string; include_cancelled?: boolean }, unknown];
    expect(typeof q.start).toBe('string');
    expect(typeof q.end).toBe('string');
    expect(q.start!.length).toBeGreaterThan(0);
    expect(q.end!.length).toBeGreaterThan(0);
  });

  it('returns events from the response', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // by default cancelled events are in the raw list but the status filter is '' so all show
    expect(result.current.events.map((e) => e.id)).toContain('ev1');
    expect(result.current.events.map((e) => e.id)).toContain('ev2');
  });
});

describe('usePublishingCalendar — navigation', () => {
  it('next() moves the anchor forward and triggers a refetch', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const prevCallCount = getCalendar.mock.calls.length;
    const prevAnchor = result.current.anchor.getTime();

    act(() => { result.current.next(); });
    await waitFor(() => expect(getCalendar.mock.calls.length).toBeGreaterThan(prevCallCount));
    expect(result.current.anchor.getTime()).toBeGreaterThan(prevAnchor);
  });

  it('prev() moves the anchor backward and triggers a refetch', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const prevCallCount = getCalendar.mock.calls.length;
    const prevAnchor = result.current.anchor.getTime();

    act(() => { result.current.prev(); });
    await waitFor(() => expect(getCalendar.mock.calls.length).toBeGreaterThan(prevCallCount));
    expect(result.current.anchor.getTime()).toBeLessThan(prevAnchor);
  });

  it('today() resets anchor to today', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.next(); result.current.next(); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.today(); });
    const now = new Date();
    await waitFor(() => {
      const a = result.current.anchor;
      expect(a.getFullYear()).toBe(now.getFullYear());
      expect(a.getMonth()).toBe(now.getMonth());
      expect(a.getDate()).toBe(now.getDate());
    });
  });
});

describe('usePublishingCalendar — view switching', () => {
  it('switching to week narrows the date range vs month', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // record the month-view range (call[0])
    const monthCall = getCalendar.mock.calls[0][0] as { start: string; end: string };
    const monthSpan = new Date(monthCall.end).getTime() - new Date(monthCall.start).getTime();

    const prevCount = getCalendar.mock.calls.length;
    act(() => { result.current.setView('week'); });
    await waitFor(() => expect(getCalendar.mock.calls.length).toBeGreaterThan(prevCount));

    const weekCall = getCalendar.mock.calls[getCalendar.mock.calls.length - 1][0] as { start: string; end: string };
    const weekSpan = new Date(weekCall.end).getTime() - new Date(weekCall.start).getTime();

    // week span must be shorter than month span (6 weeks)
    expect(weekSpan).toBeLessThan(monthSpan);
  });
});

describe('usePublishingCalendar — client-side filters', () => {
  it('platform filter removes non-matching events', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.setFilters({ platform: 'instagram' }); });
    await waitFor(() => {
      const ids = result.current.events.map((e) => e.id);
      expect(ids).toContain('ev2');
      expect(ids).not.toContain('ev1');
    });
  });

  it('sourceProduct filter removes non-matching events', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.setFilters({ sourceProduct: 'ai_influencer' }); });
    await waitFor(() => {
      const ids = result.current.events.map((e) => e.id);
      expect(ids).toContain('ev2');
      expect(ids).not.toContain('ev1');
    });
  });

  it('status filter removes non-matching events', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.setFilters({ status: 'published' }); });
    await waitFor(() => {
      const ids = result.current.events.map((e) => e.id);
      expect(ids).toContain('ev2');
      expect(ids).not.toContain('ev1');
    });
  });
});

describe('usePublishingCalendar — includeCancelled', () => {
  it('forwards includeCancelled:true to the query', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const prevCount = getCalendar.mock.calls.length;
    act(() => { result.current.setFilters({ includeCancelled: true }); });
    await waitFor(() => expect(getCalendar.mock.calls.length).toBeGreaterThan(prevCount));

    const lastCall = getCalendar.mock.calls[getCalendar.mock.calls.length - 1][0] as { include_cancelled?: boolean };
    expect(lastCall.include_cancelled).toBe(true);
  });

  it('does NOT forward includeCancelled:false (omits the param)', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const firstCall = getCalendar.mock.calls[0][0] as { include_cancelled?: boolean };
    // false / undefined should not be forwarded as true
    expect(firstCall.include_cancelled).toBeFalsy();
  });
});

describe('usePublishingCalendar — groupByDay', () => {
  it('groups events by local date derived from scheduled_utc', async () => {
    // Two events on the same day, one on a different day
    const ev1 = makeEvent('g1', { scheduled_utc: '2099-06-01T10:00:00Z' });
    const ev2 = makeEvent('g2', { scheduled_utc: '2099-06-01T15:00:00Z' });
    const ev3 = makeEvent('g3', { scheduled_utc: '2099-06-02T10:00:00Z' });
    mockOk([ev1, ev2, ev3]);

    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const grouped = result.current.groupByDay();
    expect(grouped.get('2099-06-01')?.length).toBe(2);
    expect(grouped.get('2099-06-02')?.length).toBe(1);
  });
});

describe('usePublishingCalendar — error handling', () => {
  it('surfaces backend error message', async () => {
    getCalendar.mockResolvedValue({ ok: false, error: { kind: 'server', status: 500, message: 'Internal error' } });
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Internal error');
    expect(result.current.events).toHaveLength(0);
  });
});

describe('usePublishingCalendar — refetch', () => {
  it('refetch() triggers a new getCalendar call', async () => {
    const { result } = renderHook(() => usePublishingCalendar());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const prevCount = getCalendar.mock.calls.length;
    act(() => { result.current.refetch(); });
    await waitFor(() => expect(getCalendar.mock.calls.length).toBeGreaterThan(prevCount));
  });
});
