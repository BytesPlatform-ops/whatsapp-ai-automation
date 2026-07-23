'use client';

import { ExternalLink } from 'lucide-react';
import type { CalendarEvent } from '@/lib/pixie-lab/publishingClient';
import { statusMeta, platformLabel, formatDateTime, isSimulatedPostId } from '@/lib/pixie-lab/publishingFormat';

export interface CalendarListProps {
  events: CalendarEvent[];
  onOpen: (id: string) => void;
}

export function CalendarList({ events, onOpen }: CalendarListProps) {
  if (events.length === 0) {
    return (
      <p className="py-12 text-center text-[13.5px] text-[var(--pl-text-muted)]">
        No events match the current filters.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" role="list">
      {events.map((ev) => {
        const meta = statusMeta(ev.status);
        const simulated = isSimulatedPostId(ev.platform_post_id);

        return (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => onOpen(ev.id)}
              aria-label={`${platformLabel(ev.platform)} — ${meta.label} — ${formatDateTime(ev.scheduled_utc)}`}
              className="w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3 text-left transition hover:border-[var(--pl-green)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]"
            >
              {/* Row 1: status + platform + mode + time */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status */}
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--pl-text)]">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: meta.dot }}
                    aria-hidden
                  />
                  {meta.label}
                </span>

                {/* Platform */}
                <span className="rounded border border-[var(--pl-border)] px-1.5 py-0.5 text-[10.5px] text-[var(--pl-text-muted)]">
                  {platformLabel(ev.platform)}
                </span>

                {/* Mode */}
                <span
                  className="rounded border px-1.5 py-0.5 text-[10.5px] font-semibold"
                  style={
                    ev.mode === 'live'
                      ? { borderColor: '#e5484d', color: '#e5484d' }
                      : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-muted)' }
                  }
                >
                  {ev.mode === 'live' ? 'live' : 'dry-run'}
                </span>

                {/* Simulated badge */}
                {simulated && (
                  <span className="rounded border border-[var(--pl-border)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">
                    Simulated
                  </span>
                )}

                {/* Source product */}
                <span className="text-[11px] text-[var(--pl-text-muted)]">
                  {ev.source_product.replace('_', ' ')}
                </span>

                {/* Local time */}
                <span className="ml-auto shrink-0 text-[11px] text-[var(--pl-text-muted)]">
                  {formatDateTime(ev.scheduled_utc)}
                </span>
              </div>

              {/* Row 2: destination + preview */}
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {ev.account_id && (
                  <span className="text-[11px] text-[var(--pl-text-muted)]">{ev.account_id}</span>
                )}
                {ev.preview && (
                  <span className="line-clamp-1 text-[12.5px] text-[var(--pl-text-soft)]">{ev.preview}</span>
                )}
              </div>

              {/* Row 3: permalink */}
              {ev.platform_permalink && (
                <span
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--pl-green)] hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(ev.platform_permalink, '_blank', 'noreferrer');
                  }}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      window.open(ev.platform_permalink, '_blank', 'noreferrer');
                    }
                  }}
                  aria-label={`Open published post on ${platformLabel(ev.platform)}`}
                >
                  <ExternalLink size={10} aria-hidden />
                  View post
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
