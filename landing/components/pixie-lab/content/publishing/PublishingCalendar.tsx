'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Play } from 'lucide-react';
import { runWorkerOnce } from '@/lib/pixie-lab/publishingClient';
import { usePublishingCalendar } from '@/lib/pixie-lab/usePublishingCalendar';
import { GhostButton, Spinner, ErrorNote, EmptyState } from '../agent/ui';
import { CalendarMonth } from './CalendarMonth';
import { CalendarWeek } from './CalendarWeek';
import { CalendarList } from './CalendarList';
import { JobDetailDrawer } from './JobDetailDrawer';

// ── constants ──────────────────────────────────────────────────────────────────

const VIEWS = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'list', label: 'List' },
] as const;

const PLATFORMS = ['', 'facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube'] as const;
const SOURCE_PRODUCTS = ['', 'content_agent', 'ai_influencer'] as const;
const STATUSES = [
  '', 'draft', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled', 'retry_wait', 'reconnection_required',
] as const;

// ── period title ───────────────────────────────────────────────────────────────

function periodTitle(view: 'month' | 'week' | 'list', anchor: Date): string {
  if (view === 'month') {
    return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (view === 'week') {
    const weekStart = new Date(anchor);
    weekStart.setDate(anchor.getDate() - anchor.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const startStr = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endStr = weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  }
  return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// ── component ──────────────────────────────────────────────────────────────────

export function PublishingCalendar() {
  const cal = usePublishingCalendar();
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerErr, setWorkerErr] = useState('');

  async function handleRunWorker() {
    setWorkerBusy(true);
    setWorkerErr('');
    const res = await runWorkerOnce();
    setWorkerBusy(false);
    if (!res.ok) { setWorkerErr(res.error.message); return; }
    cal.refetch();
  }

  const title = periodTitle(cal.view, cal.anchor);

  return (
    <div>
      {/* Header: title + nav + view switcher */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Period navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={cal.prev}
            aria-label="Previous period"
            className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] hover:text-[var(--pl-text)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]"
          >
            <ChevronLeft size={15} aria-hidden />
          </button>
          <h2 className="min-w-[11rem] text-center font-display text-[0.95rem] font-extrabold tracking-tight text-[var(--pl-text)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={cal.next}
            aria-label="Next period"
            className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] hover:text-[var(--pl-text)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]"
          >
            <ChevronRight size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={cal.today}
            className="ml-1 rounded-lg border border-[var(--pl-border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)] hover:text-[var(--pl-text)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]"
          >
            Today
          </button>
        </div>

        {/* View switcher */}
        <div
          role="tablist"
          aria-label="Calendar view"
          className="flex rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-0.5"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              type="button"
              aria-selected={cal.view === v.id}
              onClick={() => cal.setView(v.id)}
              className={[
                'rounded-md px-3 py-1 text-[12px] font-semibold transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--pl-green)]',
                cal.view === v.id
                  ? 'bg-[var(--pl-surface)] text-[var(--pl-text)] shadow-sm'
                  : 'text-[var(--pl-text-muted)] hover:text-[var(--pl-text)]',
              ].join(' ')}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="ml-auto flex items-center gap-2">
          <GhostButton onClick={cal.refetch} disabled={cal.loading} aria-label="Refresh calendar">
            <RefreshCw size={13} aria-hidden /> Refresh
          </GhostButton>
          <GhostButton onClick={handleRunWorker} disabled={workerBusy} aria-label="Run worker once (dry-run)">
            <Play size={13} aria-hidden /> {workerBusy ? 'Running…' : 'Run worker (dry-run)'}
          </GhostButton>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--pl-text-muted)]">
          Platform
          <select
            value={cal.filters.platform}
            onChange={(e) => cal.setFilters({ platform: e.target.value })}
            className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2 py-1 text-[12px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
          >
            <option value="">All</option>
            {PLATFORMS.filter(Boolean).map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-[var(--pl-text-muted)]">
          Source
          <select
            value={cal.filters.sourceProduct}
            onChange={(e) => cal.setFilters({ sourceProduct: e.target.value })}
            className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2 py-1 text-[12px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
          >
            <option value="">All</option>
            {SOURCE_PRODUCTS.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-[var(--pl-text-muted)]">
          Status
          <select
            value={cal.filters.status}
            onChange={(e) => cal.setFilters({ status: e.target.value })}
            className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2 py-1 text-[12px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
          >
            <option value="">All</option>
            {STATUSES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[12px] text-[var(--pl-text-muted)]">
          <input
            type="checkbox"
            checked={cal.filters.includeCancelled}
            onChange={(e) => cal.setFilters({ includeCancelled: e.target.checked })}
            className="rounded border border-[var(--pl-border)] accent-[var(--pl-green)]"
          />
          Include cancelled
        </label>
      </div>

      {workerErr && (
        <div className="mb-3">
          <ErrorNote>{workerErr}</ErrorNote>
        </div>
      )}

      {/* Calendar body */}
      {cal.loading ? (
        <Spinner label="Loading calendar…" />
      ) : cal.error ? (
        <ErrorNote>{cal.error}</ErrorNote>
      ) : cal.events.length === 0 ? (
        <EmptyState
          title="No events"
          body="There are no scheduled or published events in this period. Publish a content item or schedule an influencer video to see it here."
        />
      ) : (
        <>
          {cal.view === 'month' && (
            <CalendarMonth anchor={cal.anchor} events={cal.events} onOpen={setOpenJobId} />
          )}
          {cal.view === 'week' && (
            <CalendarWeek anchor={cal.anchor} events={cal.events} onOpen={setOpenJobId} />
          )}
          {cal.view === 'list' && (
            <CalendarList events={cal.events} onOpen={setOpenJobId} />
          )}
        </>
      )}

      {/* Job detail drawer */}
      <JobDetailDrawer jobId={openJobId} onClose={() => setOpenJobId(null)} />
    </div>
  );
}
