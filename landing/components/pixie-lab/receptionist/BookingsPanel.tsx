'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, XCircle } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpBookingRow } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Pill, GhostButton, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#16a34a', pending: '#f59e0b', cancelled: '#64748b', failed: '#dc2626',
  rescheduled: '#3b82f6', reconciliation_required: '#f97316',
};
const FILTERS = ['all', 'confirmed', 'pending', 'cancelled', 'reconciliation_required'] as const;
type Filter = (typeof FILTERS)[number];

/** Honest label — never "confirmed" without a provider event id. */
function bookingLabel(b: RcpBookingRow): string {
  if (b.status === 'confirmed') return b.provider_event_id ? 'Confirmed' : 'Provider pending';
  return (b.status || 'request').replace(/_/g, ' ');
}

export default function BookingsPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [rows, setRows] = useState<RcpBookingRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await receptionistApi.getCalendarBookings();
    if (!r.backendUp) { setStatus('offline'); return; }
    setRows((r as { bookings?: RcpBookingRow[] }).bookings || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((b) => (b.status || 'request') === filter)),
    [rows, filter],
  );

  async function cancel(id: string) {
    setBusy(id); setErr('');
    const r = await receptionistApi.cancelCalendarBooking(id);
    setBusy('');
    if (!r.backendUp) setErr('Could not cancel booking.');
    await load();
  }
  async function reconcile(id: string) {
    setBusy(id);
    await receptionistApi.reconcileCalendarBooking(id);
    setBusy('');
    await load();
  }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  return (
    <div className="space-y-4" data-testid="bookings-panel">
      {err && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${filter === f ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600'}`}>
            {f.replace(/_/g, ' ')}
          </button>
        ))}
        <GhostButton onClick={load} aria-label="Refresh"><RefreshCw size={14} /></GhostButton>
      </div>

      <Section title="Bookings" sub={`${filtered.length} shown`}>
        {filtered.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No bookings in this view.</p></Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((b) => (
              <Card key={b.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{b.name || b.email || 'Customer'}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600">{b.service_type}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Pill color={STATUS_COLORS[b.status || ''] || '#64748b'}>{bookingLabel(b)}</Pill>
                      <span>{fmtDate(b.start)} {b.timezone}</span>
                      {b.provider_event_id ? <span>· evt {b.provider_event_id}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.status === 'reconciliation_required' && (
                      <GhostButton onClick={() => reconcile(b.id)} disabled={busy === b.id}>Reconcile</GhostButton>
                    )}
                    {b.status === 'confirmed' && (
                      <GhostButton onClick={() => cancel(b.id)} disabled={busy === b.id} aria-label="Cancel booking">
                        <XCircle size={14} /> Cancel
                      </GhostButton>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
