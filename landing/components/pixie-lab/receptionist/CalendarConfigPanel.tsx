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
  const [savedNote, setSavedNote] = useState('');
  // scheduling settings form
  const [tz, setTz] = useState('UTC');
  const [startHour, setStartHour] = useState('9');
  const [endHour, setEndHour] = useState('17');
  const [days, setDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [notice, setNotice] = useState('120');
  const [horizon, setHorizon] = useState('30');
  const [interval, setInterval] = useState('30');
  const [bufBefore, setBufBefore] = useState('0');
  const [bufAfter, setBufAfter] = useState('0');
  const [policy, setPolicy] = useState('approval_required');
  const [reminderOffsets, setReminderOffsets] = useState('1440, 60');

  const load = useCallback(async () => {
    const r = await receptionistApi.getCalendarStatus();
    if (!r.backendUp) { setStatus('offline'); return; }
    const s = r as RcpCalendarStatus;
    setCal(s);
    setServices(s.services || {});
    if (s.timezone) setTz(s.timezone);
    setStatus('ready');
  }, []);

  const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  async function saveSettings() {
    setErr(''); setSavedNote('');
    const sh = parseInt(startHour, 10), eh = parseInt(endHour, 10);
    if (!Number.isFinite(sh) || !Number.isFinite(eh) || sh < 0 || eh > 24 || sh >= eh) {
      setErr('Working hours must be valid (start before end, 0–24).'); return;
    }
    const workingHours: Record<string, number[]> = {};
    for (const d of days) workingHours[d] = [sh, eh];
    const offsets = reminderOffsets.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    setBusy('settings');
    const r = await receptionistApi.saveCalendarConfig({
      timezone: tz.trim() || 'UTC', working_hours: workingHours,
      min_notice_minutes: parseInt(notice, 10) || 0, max_horizon_days: parseInt(horizon, 10) || 30,
      slot_interval: parseInt(interval, 10) || 30, buffer_before: parseInt(bufBefore, 10) || 0,
      buffer_after: parseInt(bufAfter, 10) || 0, booking_policy: policy, reminder_offsets: offsets,
    });
    setBusy('');
    if (!r.backendUp) { setErr('Could not save scheduling settings.'); return; }
    setSavedNote('Scheduling settings saved.');
    await load();
  }

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
      {savedNote && <div role="status" className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">{savedNote}</div>}

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

      <Section title="Scheduling settings" sub="Timezone, working hours, notice, buffers and policies used to compute availability.">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Timezone (IANA)"><TextInput value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Europe/London" data-testid="tz" /></Field>
            <Field label="Booking policy">
              <select value={policy} onChange={(e) => setPolicy(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" data-testid="policy">
                <option value="automatic">Automatic</option>
                <option value="approval_required">Approval required</option>
                <option value="manual_request_only">Manual request only</option>
              </select>
            </Field>
            <Field label="Working hours (start–end, 24h)">
              <div className="flex items-center gap-2">
                <TextInput type="number" value={startHour} onChange={(e) => setStartHour(e.target.value)} className="w-20" data-testid="start-hour" />
                <span className="text-slate-400">to</span>
                <TextInput type="number" value={endHour} onChange={(e) => setEndHour(e.target.value)} className="w-20" data-testid="end-hour" />
              </div>
            </Field>
            <Field label="Working days">
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d) => (
                  <button key={d} onClick={() => setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
                    aria-pressed={days.includes(d)}
                    className={`rounded px-2 py-1 text-xs capitalize ${days.includes(d) ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600'}`}>
                    {d}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Min notice (minutes)"><TextInput type="number" value={notice} onChange={(e) => setNotice(e.target.value)} data-testid="notice" /></Field>
            <Field label="Max horizon (days)"><TextInput type="number" value={horizon} onChange={(e) => setHorizon(e.target.value)} data-testid="horizon" /></Field>
            <Field label="Slot interval (minutes)"><TextInput type="number" value={interval} onChange={(e) => setInterval(e.target.value)} /></Field>
            <Field label="Buffers before / after (minutes)">
              <div className="flex items-center gap-2">
                <TextInput type="number" value={bufBefore} onChange={(e) => setBufBefore(e.target.value)} className="w-20" />
                <span className="text-slate-400">/</span>
                <TextInput type="number" value={bufAfter} onChange={(e) => setBufAfter(e.target.value)} className="w-20" />
              </div>
            </Field>
            <Field label="Reminder offsets (minutes before)"><TextInput value={reminderOffsets} onChange={(e) => setReminderOffsets(e.target.value)} placeholder="1440, 60" /></Field>
          </div>
          <div className="mt-3">
            <PrimaryButton onClick={saveSettings} disabled={busy === 'settings'}>{busy === 'settings' ? 'Saving…' : 'Save settings'}</PrimaryButton>
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
