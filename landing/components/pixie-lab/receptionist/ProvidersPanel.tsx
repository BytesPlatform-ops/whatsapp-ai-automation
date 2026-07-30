'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Calendar, RefreshCw, PlayCircle } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpGmailStatus, RcpCalendarStatus } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, Pill, PrimaryButton, GhostButton, RCP_ACCENT } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

/** Truthful Gmail state — never a generic green when send capability is missing. */
function gmailState(s?: RcpGmailStatus): { label: string; color: string } {
  const c = s?.connection;
  if (!c?.connected) return { label: 'Not connected', color: '#64748b' };
  if (c.can_send) return { label: 'Ready for approval sends', color: '#16a34a' };
  if (c.can_draft) return { label: 'Ready for drafts', color: '#3b82f6' };
  if (c.can_read) return { label: 'Read only', color: '#f59e0b' };
  return { label: 'Permission missing', color: '#dc2626' };
}

function calendarState(s?: RcpCalendarStatus): { label: string; color: string } {
  const c = s?.connection;
  if (!c?.connected) return { label: 'Not connected', color: '#64748b' };
  if (c.can_write_events && s?.configured) return { label: 'Ready for bookings', color: '#16a34a' };
  if (c.can_write_events) return { label: 'Needs configuration', color: '#f59e0b' };
  if (c.can_read_freebusy) return { label: 'Read only', color: '#f59e0b' };
  return { label: 'Permission missing', color: '#dc2626' };
}

const REPLY_MODES = ['disabled', 'draft_only', 'approval_required', 'direct_reply'] as const;

export default function ProvidersPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [gmail, setGmail] = useState<RcpGmailStatus | undefined>();
  const [calendar, setCalendar] = useState<RcpCalendarStatus | undefined>();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [g, c] = await Promise.all([receptionistApi.getGmailStatus(), receptionistApi.getCalendarStatus()]);
    if (!g.backendUp && !c.backendUp) { setStatus('offline'); return; }
    setGmail(g as RcpGmailStatus);
    setCalendar(c as RcpCalendarStatus);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setMode(mode: string) {
    setBusy('mode'); setMsg('');
    const r = await receptionistApi.setGmailReplyMode(mode);
    setBusy('');
    if (!r.backendUp) { setMsg('Could not update reply mode.'); return; }
    await load();
  }

  async function sync(mode: 'initial' | 'incremental') {
    setBusy(mode); setMsg('');
    const r = await receptionistApi.startGmailSync(mode);
    setBusy('');
    setMsg(r.backendUp ? `Sync queued (${mode}).` : 'Could not queue sync.');
  }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  const gs = gmailState(gmail);
  const cs = calendarState(calendar);

  return (
    <div className="space-y-6" data-testid="providers-panel">
      {msg && <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</div>}

      <Section title="Gmail" sub="Inbound sync + approval-gated replies. Live send only with the gmail.send scope.">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail size={16} color="#ea4335" />
              <span className="font-medium">{gmail?.connection?.email || 'No Google account'}</span>
              <Pill color={gs.color}>{gs.label}</Pill>
            </div>
            <GhostButton onClick={load} aria-label="Refresh Gmail"><RefreshCw size={14} /></GhostButton>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Reply mode">
              <select data-testid="reply-mode" value={gmail?.reply_mode || 'draft_only'}
                onChange={(e) => setMode(e.target.value)} disabled={busy === 'mode'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {REPLY_MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Sync">
              <div className="flex gap-2">
                <PrimaryButton onClick={() => sync('initial')} disabled={busy === 'initial'}>
                  <PlayCircle size={14} /> Initial
                </PrimaryButton>
                <GhostButton onClick={() => sync('incremental')} disabled={busy === 'incremental'}>Incremental</GhostButton>
              </div>
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Last sync: {gmail?.last_sync_at || '—'} · history id: {gmail?.last_history_id || '—'}
          </p>
        </Card>
      </Section>

      <Section title="Google Calendar" sub="Availability + provider-confirmed bookings.">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar size={16} color="#4285f4" />
              <span className="font-medium">{calendar?.connection?.email || 'No Google account'}</span>
              <Pill color={cs.color}>{cs.label}</Pill>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Calendar: {calendar?.calendar_id || '—'} · timezone: {calendar?.timezone || 'UTC'} ·
            {' '}services: {Object.keys(calendar?.services || {}).length}
          </p>
          {!calendar?.configured && calendar?.connection?.connected && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Add a booking calendar, timezone, working hours and at least one service to enable bookings.
            </p>
          )}
        </Card>
      </Section>
    </div>
  );
}
