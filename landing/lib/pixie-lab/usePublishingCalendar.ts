'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { getCalendar, type CalendarEvent } from '@/lib/pixie-lab/publishingClient';

// ── types ────────────────────────────────────────────────────────────────────

export type CalendarView = 'month' | 'week' | 'list';

export interface CalendarFilters {
  platform: string;
  sourceProduct: string;
  status: string;
  includeCancelled: boolean;
}

export interface UsePublishingCalendarReturn {
  view: CalendarView;
  setView: (v: CalendarView) => void;
  anchor: Date;
  prev: () => void;
  next: () => void;
  today: () => void;
  filters: CalendarFilters;
  setFilters: (f: Partial<CalendarFilters>) => void;
  events: CalendarEvent[];
  loading: boolean;
  error: string;
  refetch: () => void;
  /** Group events by local YYYY-MM-DD derived from scheduled_utc */
  groupByDay: (evts?: CalendarEvent[]) => Map<string, CalendarEvent[]>;
}

// ── range computation ─────────────────────────────────────────────────────────

function toLocalDateStr(utcIso: string): string {
  const d = new Date(utcIso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoWithBuffer(d: Date, bufferDays: number): string {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + bufferDays);
  return copy.toISOString();
}

function computeRange(view: CalendarView, anchor: Date): { start: string; end: string } {
  if (view === 'month') {
    // Full 6-week grid span: first calendar Sunday on/before the 1st of the month
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay()); // Sunday
    const gridEnd = new Date(gridStart);
    gridEnd.setDate(gridStart.getDate() + 42); // 6 weeks
    return {
      start: isoWithBuffer(gridStart, -1),
      end: isoWithBuffer(gridEnd, 1),
    };
  }

  if (view === 'week') {
    // Sun–Sat week containing anchor
    const weekStart = new Date(anchor);
    weekStart.setDate(anchor.getDate() - anchor.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return {
      start: isoWithBuffer(weekStart, -1),
      end: isoWithBuffer(weekEnd, 1),
    };
  }

  // list: anchor-30d … anchor+90d
  const listStart = new Date(anchor);
  listStart.setDate(anchor.getDate() - 30);
  const listEnd = new Date(anchor);
  listEnd.setDate(anchor.getDate() + 90);
  return {
    start: isoWithBuffer(listStart, -1),
    end: isoWithBuffer(listEnd, 1),
  };
}

// ── state / reducer ────────────────────────────────────────────────────────────

interface State {
  view: CalendarView;
  anchor: Date;
  filters: CalendarFilters;
  rawEvents: CalendarEvent[];
  loading: boolean;
  error: string;
  fetchKey: number; // increment to trigger a refetch
}

type Action =
  | { type: 'SET_VIEW'; view: CalendarView }
  | { type: 'SET_ANCHOR'; anchor: Date }
  | { type: 'SET_FILTERS'; filters: Partial<CalendarFilters> }
  | { type: 'FETCH_START' }
  | { type: 'FETCH_OK'; events: CalendarEvent[] }
  | { type: 'FETCH_ERR'; error: string }
  | { type: 'REFETCH' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.view };
    case 'SET_ANCHOR':
      return { ...state, anchor: action.anchor };
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.filters } };
    case 'FETCH_START':
      return { ...state, loading: true, error: '' };
    case 'FETCH_OK':
      return { ...state, loading: false, error: '', rawEvents: action.events };
    case 'FETCH_ERR':
      return { ...state, loading: false, error: action.error };
    case 'REFETCH':
      return { ...state, fetchKey: state.fetchKey + 1 };
    default:
      return state;
  }
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function usePublishingCalendar(): UsePublishingCalendarReturn {
  const [state, dispatch] = useReducer(reducer, {
    view: 'month',
    anchor: (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    })(),
    filters: { platform: '', sourceProduct: '', status: '', includeCancelled: false },
    rawEvents: [],
    loading: true,
    error: '',
    fetchKey: 0,
  });

  const abortRef = useRef<AbortController | null>(null);

  const fetchEvents = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    dispatch({ type: 'FETCH_START' });
    const { start, end } = computeRange(state.view, state.anchor);
    const res = await getCalendar(
      { start, end, include_cancelled: state.filters.includeCancelled || undefined },
      ctrl.signal,
    );
    if (ctrl.signal.aborted) return;
    if (!res.ok) {
      dispatch({ type: 'FETCH_ERR', error: res.error.message });
      return;
    }
    dispatch({ type: 'FETCH_OK', events: res.data.events });
  }, [state.view, state.anchor, state.filters.includeCancelled, state.fetchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchEvents();
    return () => { abortRef.current?.abort(); };
  }, [fetchEvents]);

  // Client-side filter (platform, sourceProduct, status)
  const events = useMemo(() => {
    return state.rawEvents.filter((ev) => {
      if (state.filters.platform && ev.platform !== state.filters.platform) return false;
      if (state.filters.sourceProduct && ev.source_product !== state.filters.sourceProduct) return false;
      if (state.filters.status && ev.status !== state.filters.status) return false;
      return true;
    });
  }, [state.rawEvents, state.filters.platform, state.filters.sourceProduct, state.filters.status]);

  const setView = useCallback((v: CalendarView) => dispatch({ type: 'SET_VIEW', view: v }), []);

  const prev = useCallback(() => {
    const a = new Date(state.anchor);
    if (state.view === 'month') a.setMonth(a.getMonth() - 1);
    else if (state.view === 'week') a.setDate(a.getDate() - 7);
    else a.setDate(a.getDate() - 30);
    dispatch({ type: 'SET_ANCHOR', anchor: a });
  }, [state.anchor, state.view]);

  const next = useCallback(() => {
    const a = new Date(state.anchor);
    if (state.view === 'month') a.setMonth(a.getMonth() + 1);
    else if (state.view === 'week') a.setDate(a.getDate() + 7);
    else a.setDate(a.getDate() + 30);
    dispatch({ type: 'SET_ANCHOR', anchor: a });
  }, [state.anchor, state.view]);

  const todayFn = useCallback(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    dispatch({ type: 'SET_ANCHOR', anchor: d });
  }, []);

  const setFilters = useCallback((f: Partial<CalendarFilters>) => {
    dispatch({ type: 'SET_FILTERS', filters: f });
  }, []);

  const refetch = useCallback(() => dispatch({ type: 'REFETCH' }), []);

  const groupByDay = useCallback(
    (evts?: CalendarEvent[]): Map<string, CalendarEvent[]> => {
      const list = evts ?? events;
      const map = new Map<string, CalendarEvent[]>();
      for (const ev of list) {
        const day = toLocalDateStr(ev.scheduled_utc);
        const bucket = map.get(day) ?? [];
        bucket.push(ev);
        map.set(day, bucket);
      }
      return map;
    },
    [events],
  );

  return {
    view: state.view,
    setView,
    anchor: state.anchor,
    prev,
    next,
    today: todayFn,
    filters: state.filters,
    setFilters,
    events,
    loading: state.loading,
    error: state.error,
    refetch,
    groupByDay,
  };
}
