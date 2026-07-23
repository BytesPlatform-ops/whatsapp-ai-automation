'use client';

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

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build the 7-day Sun–Sat week containing anchor. */
function buildWeek(anchor: Date): Date[] {
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() - anchor.getDay());
  weekStart.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

// ── component ─────────────────────────────────────────────────────────────────

export interface CalendarWeekProps {
  anchor: Date;
  events: CalendarEvent[];
  onOpen: (id: string) => void;
}

export function CalendarWeek({ anchor, events, onOpen }: CalendarWeekProps) {
  const week = buildWeek(anchor);
  const todayKey = dateKey(new Date());

  // Group events by local day, sorted by time
  const byDay = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = toLocalDateStr(ev.scheduled_utc);
    const bucket = byDay.get(key) ?? [];
    bucket.push(ev);
    byDay.set(key, bucket);
  }
  for (const [k, list] of byDay) {
    byDay.set(
      k,
      [...list].sort((a, b) => new Date(a.scheduled_utc).getTime() - new Date(b.scheduled_utc).getTime()),
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {week.map((day) => {
        const key = dateKey(day);
        const dayEvents = byDay.get(key) ?? [];
        const isToday = key === todayKey;

        return (
          <div key={key} className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)]">
            {/* Day header */}
            <div
              className={[
                'flex items-center justify-between rounded-t-xl border-b border-[var(--pl-border)] px-3 py-2',
                isToday ? 'bg-[var(--pl-green-soft,rgba(34,197,94,0.08))]' : '',
              ].join(' ')}
            >
              <span className={['text-[11px] font-bold uppercase tracking-wide', isToday ? 'text-[var(--pl-green)]' : 'text-[var(--pl-text-muted)]'].join(' ')}>
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              <span
                className={[
                  'flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold',
                  isToday ? 'bg-[var(--pl-green)] text-[#02120f]' : 'text-[var(--pl-text)]',
                ].join(' ')}
              >
                {day.getDate()}
              </span>
            </div>

            {/* Events */}
            <div className="flex flex-col gap-1 p-2">
              {dayEvents.length === 0 ? (
                <p className="py-2 text-center text-[10.5px] text-[var(--pl-text-muted)]">—</p>
              ) : (
                dayEvents.map((ev) => {
                  const meta = statusMeta(ev.status);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onOpen(ev.id)}
                      aria-label={`${platformLabel(ev.platform)} — ${meta.label} — ${formatDateTime(ev.scheduled_utc)}`}
                      className="w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2 py-1.5 text-left hover:border-[var(--pl-green)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]"
                    >
                      {/* Status + time */}
                      <span className="flex items-center gap-1">
                        <span
                          className="h-1.5 w-1.5 flex-none rounded-full"
                          style={{ background: meta.dot }}
                          aria-hidden
                        />
                        <span className="truncate text-[10.5px] font-semibold text-[var(--pl-text)]">
                          {meta.label}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] text-[var(--pl-text-muted)]">
                          {new Date(ev.scheduled_utc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>

                      {/* Platform + destination */}
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--pl-text-muted)]">
                        <span>{platformLabel(ev.platform)}</span>
                        {ev.account_id && <span>· {ev.account_id}</span>}
                      </span>

                      {/* Source product */}
                      <span className="text-[9.5px] text-[var(--pl-text-muted)]">
                        {ev.source_product.replace('_', ' ')}
                      </span>

                      {/* Preview */}
                      {ev.preview && (
                        <span className="mt-0.5 block truncate text-[10px] text-[var(--pl-text-muted)]">
                          {ev.preview}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
