'use client';

import { useEffect, useRef, useState } from 'react';
import type { CalendarEvent } from '@/lib/pixie-lab/publishingClient';
import { statusMeta, platformLabel, formatDateTime } from '@/lib/pixie-lab/publishingFormat';

// ── helpers ───────────────────────────────────────────────────────────────────

function toLocalDateStr(utcIso: string): string {
  const d = new Date(utcIso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build a 6-week (42-day) grid starting on the Sunday on/before the 1st of the month. */
function buildGrid(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE = 3;

// ── sub-components ────────────────────────────────────────────────────────────

function EventChip({ event, onOpen }: { event: CalendarEvent; onOpen: (id: string) => void }) {
  const meta = statusMeta(event.status);
  const localTime = formatDateTime(event.scheduled_utc);
  const label = `${platformLabel(event.platform)} — ${meta.label} — ${localTime}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      aria-label={label}
      className="w-full rounded border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-left transition hover:border-[var(--pl-green)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]"
    >
      <span className="flex min-w-0 items-center gap-1">
        <span
          className="h-1.5 w-1.5 flex-none rounded-full"
          style={{ background: meta.dot }}
          aria-hidden
        />
        <span className="truncate text-[10.5px] font-semibold text-[var(--pl-text)]">
          {platformLabel(event.platform)}
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-[var(--pl-text-muted)]">
          {new Date(event.scheduled_utc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
      </span>
      {event.preview && (
        <span className="block truncate text-[10px] text-[var(--pl-text-muted)]">{event.preview}</span>
      )}
    </button>
  );
}

interface DayCellProps {
  day: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
  onOpen: (id: string) => void;
  tabIndex: number;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, day: Date) => void;
  cellRef: (el: HTMLDivElement | null) => void;
}

function DayCell({ day, isCurrentMonth, isToday, events, onOpen, tabIndex, onKeyDown, cellRef }: DayCellProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, MAX_VISIBLE);
  const overflow = events.length - MAX_VISIBLE;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (events.length === 1) onOpen(events[0].id);
      else setExpanded((x) => !x);
    }
    onKeyDown(e, day);
  };

  return (
    <div
      ref={cellRef}
      role="gridcell"
      tabIndex={tabIndex}
      aria-label={day.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      onKeyDown={handleKeyDown}
      className={[
        'relative flex min-h-[5rem] flex-col gap-0.5 rounded-lg border p-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]',
        isCurrentMonth
          ? 'border-[var(--pl-border)] bg-[var(--pl-surface)]'
          : 'border-[var(--pl-border)] bg-[var(--pl-surface-soft)] opacity-40',
      ].join(' ')}
    >
      <span
        className={[
          'ml-auto flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold',
          isToday
            ? 'bg-[var(--pl-green)] text-[#02120f]'
            : 'text-[var(--pl-text-muted)]',
        ].join(' ')}
      >
        {day.getDate()}
      </span>

      <div className="flex flex-col gap-0.5">
        {visible.map((ev) => (
          <EventChip key={ev.id} event={ev} onOpen={onOpen} />
        ))}
        {!expanded && overflow > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded px-1 text-left text-[10px] font-semibold text-[var(--pl-text-muted)] hover:text-[var(--pl-text)]"
            aria-label={`Show ${overflow} more event${overflow === 1 ? '' : 's'} on ${day.toLocaleDateString()}`}
          >
            +{overflow} more
          </button>
        )}
        {expanded && overflow > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded px-1 text-left text-[10px] font-semibold text-[var(--pl-text-muted)] hover:text-[var(--pl-text)]"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

// ── narrow / list fallback ─────────────────────────────────────────────────────

function DayList({ day, events, onOpen, isToday }: { day: Date; events: CalendarEvent[]; onOpen: (id: string) => void; isToday: boolean }) {
  if (events.length === 0) return null;
  return (
    <div className="border-b border-[var(--pl-border)] pb-3">
      <p className={['mb-1.5 text-[11.5px] font-bold', isToday ? 'text-[var(--pl-green)]' : 'text-[var(--pl-text-muted)]'].join(' ')}>
        {day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        {isToday && ' · Today'}
      </p>
      <div className="flex flex-col gap-1">
        {events.map((ev) => {
          const meta = statusMeta(ev.status);
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => onOpen(ev.id)}
              aria-label={`${platformLabel(ev.platform)} — ${meta.label} — ${formatDateTime(ev.scheduled_utc)}`}
              className="flex items-center gap-2 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-left hover:border-[var(--pl-green)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]"
            >
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: meta.dot }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-[var(--pl-text)]">
                  {platformLabel(ev.platform)} · {meta.label}
                </span>
                {ev.preview && (
                  <span className="block truncate text-[11px] text-[var(--pl-text-muted)]">{ev.preview}</span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--pl-text-muted)]">
                {new Date(ev.scheduled_utc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export interface CalendarMonthProps {
  anchor: Date;
  events: CalendarEvent[];
  onOpen: (id: string) => void;
}

export function CalendarMonth({ anchor, events, onOpen }: CalendarMonthProps) {
  const grid = buildGrid(anchor);
  const today = dateKey(new Date());
  const currentMonth = anchor.getMonth();

  // Group events by local day
  const byDay = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = toLocalDateStr(ev.scheduled_utc);
    const bucket = byDay.get(key) ?? [];
    bucket.push(ev);
    byDay.set(key, bucket);
  }

  // Roving tabindex for keyboard navigation
  const [focusedKey, setFocusedKey] = useState<string>(today);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const el = cellRefs.current.get(focusedKey);
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }, [focusedKey]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, day: Date) => {
    const ARROWS: Record<string, number> = {
      ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7,
    };
    if (ARROWS[e.key] !== undefined) {
      e.preventDefault();
      const next = new Date(day);
      next.setDate(day.getDate() + ARROWS[e.key]);
      setFocusedKey(dateKey(next));
    }
  };

  return (
    <>
      {/* Desktop: 6-week grid (hidden on narrow screens) */}
      <div className="hidden sm:block">
        {/* Weekday headers */}
        <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="py-1 text-center text-[10.5px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">
              {wd}
            </div>
          ))}
        </div>

        {/* 6 × 7 grid */}
        <div
          role="grid"
          aria-label={`Calendar for ${anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`}
          className="grid grid-cols-7 gap-1"
        >
          {grid.map((day) => {
            const key = dateKey(day);
            const dayEvents = byDay.get(key) ?? [];
            const isMine = day.getMonth() === currentMonth;
            return (
              <DayCell
                key={key}
                day={day}
                isCurrentMonth={isMine}
                isToday={key === today}
                events={dayEvents}
                onOpen={onOpen}
                tabIndex={key === focusedKey ? 0 : -1}
                onKeyDown={handleKeyDown}
                cellRef={(el) => {
                  if (el) cellRefs.current.set(key, el);
                  else cellRefs.current.delete(key);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Narrow: stacked day list (only days with events, shown below 640px) */}
      <div className="sm:hidden flex flex-col gap-3">
        {grid.map((day) => {
          const key = dateKey(day);
          const dayEvents = byDay.get(key) ?? [];
          return (
            <DayList key={key} day={day} events={dayEvents} onOpen={onOpen} isToday={key === today} />
          );
        })}
      </div>
    </>
  );
}
