'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, PlayCircle } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpCalendarStatus, RcpSlot } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, TextInput, PrimaryButton, GhostButton, Pill, RCP_ACCENT, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

export default function CalendarConfigPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [cal, setCal] = useState<RcpCalendarStatus>({});
  const [services, setServices] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('30');
  const [previewService, setPreviewService] = useState('');
  const [slots, setSlots] = useState<RcpSlot[] | null>(null);
  const [slotState, setSlotState] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await receptionistApi.getCalendarStatus();
    if (!r.backendUp) { setStatus('offline'); return; }
    const s = r as RcpCalendarStatus;
    setCal(s);
    setServices(s.services || {});
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveServices(next: Record<string, number>) {
    setBusy('save'); setErr('');
    const r = await receptionistApi.saveCalendarConfig({ services: next });
    setBusy('');
    if (!r.backendUp) { setErr('Could not save services.'); return; }
    setServices(next);
    await load();
  }

  function addService() {
    const n = name.trim().toLowerCase().replace(/\s+/g, '_');
    const d = parseInt(duration, 10);
    if (!n || !Number.isFinite(d) || d <= 0) { setErr('Enter a service name and a positive duration.'); return; }
    setName('');
    void saveServices({ ...services, [n]: d });
  }
  function removeService(k: string) {
    const next = { ...services };
    delete next[k];
    void saveServices(next);
  }

  async function preview() {
    const svc = previewService || Object.keys(services)[0];
    if (!svc) { setErr('Add a service first.'); return; }
    setBusy('preview'); setSlots(null); setSlotState('');
    const r = await receptionistApi.getCalendarAvailability(svc, 7);
    setBusy('');
    if (!r.backendUp) { setSlotState('offline'); return; }
    const data = r as { status?: string; slots?: RcpSlot[] };
    setSlotState(data.status || '');
    setSlots(data.slots || []);
  }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  const ready = cal.connection?.can_write_events && cal.configured && Object.keys(services).length > 0;

  return (
    <div className="space-y-6" data-testid="calendar-config-panel">
      {err && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <Section title="Booking readiness">
        <Card>
          <div className="flex items-center gap-2 text-sm">
            <Pill color={ready ? '#16a34a' : '#f59e0b'}>{ready ? 'Ready for bookings' : 'Not ready'}</Pill>
            <span className="text-xs text-slate-500">
              calendar {cal.calendar_id || '—'} · {cal.timezone || 'UTC'} · {Object.keys(services).length} service(s)
            </span>
          </div>
          {!ready && (
            <p className="mt-2 text-xs text-slate-500">
              Bookings need a writable calendar, valid timezone, working hours and at least one service.
            </p>
          )}
        </Card>
      </Section>

      <Section title="Services" sub="Each service defines a bookable duration.">
        <Card>
          <div className="flex flex-wrap gap-2">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Consultation" data-testid="service-name" />
            <TextInput value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30" type="number"
              className="w-24" data-testid="service-duration" />
            <PrimaryButton onClick={addService} disabled={busy === 'save'}><Plus size={14} /> Add</PrimaryButton>
          </div>
          <div className="mt-3 space-y-1">
            {Object.keys(services).length === 0 ? (
              <p className="text-sm text-slate-500">No services yet.</p>
            ) : Object.entries(services).map(([k, d]) => (
              <div key={k} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5 text-sm">
                <span className="capitalize">{k.replace(/_/g, ' ')} · {d} min</span>
                <GhostButton onClick={() => removeService(k)} aria-label={`Remove ${k}`}><Trash2 size={14} /></GhostButton>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Availability preview" sub="Real slots from your calendar — never sample data.">
        <Card>
          <div className="flex flex-wrap gap-2">
            <select data-testid="preview-service" value={previewService} onChange={(e) => setPreviewService(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="">First service</option>
              {Object.keys(services).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <PrimaryButton onClick={preview} disabled={busy === 'preview'}><PlayCircle size={14} /> Preview slots</PrimaryButton>
          </div>
          {slots !== null && (
            <div className="mt-3" data-testid="slots-result">
              {slotState === 'provider_unavailable' ? (
                <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">Calendar provider unavailable — try again shortly.</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-slate-500">No available slots in the next 7 days.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => <span key={s.start} className="rounded border border-slate-200 px-2 py-1 text-xs">{fmtDate(s.start)}</span>)}
                </div>
              )}
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}
