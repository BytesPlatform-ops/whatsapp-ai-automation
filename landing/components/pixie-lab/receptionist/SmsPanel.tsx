'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, Send, AlertTriangle, Clock } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpSmsStatus, RcpSmsNumber, RcpSmsDraft, RcpSmsQuietHours } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, Pill, PrimaryButton, GhostButton, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';
const REPLY_MODES = ['disabled', 'draft_only', 'approval_required', 'direct_reply'] as const;

/** Truthful readiness — never a generic green when the number can't send. */
const STATE_LABEL: Record<string, { label: string; color: string }> = {
  not_connected: { label: 'Not connected', color: '#64748b' },
  credentials_invalid: { label: 'Credentials invalid', color: '#dc2626' },
  no_numbers: { label: 'No numbers', color: '#f59e0b' },
  number_not_sms_capable: { label: 'Number not SMS-capable', color: '#f59e0b' },
  inbound_webhook_missing: { label: 'Inbound webhook missing', color: '#f59e0b' },
  delivery_webhook_missing: { label: 'Delivery webhook missing', color: '#f59e0b' },
  ready_for_inbound: { label: 'Ready for inbound', color: '#3b82f6' },
  ready_to_send: { label: 'Ready to send', color: '#16a34a' },
  needs_reconnect: { label: 'Needs reconnect', color: '#dc2626' },
};

function draftState(d: RcpSmsDraft): { label: string; color: string } {
  const s = d.status || 'generated';
  if (s === 'sent' || s === 'delivered') return { label: s, color: '#16a34a' };
  if (s === 'provider_pending') return { label: 'Provider pending', color: '#f59e0b' };
  if (s === 'pending_approval') return { label: 'Pending approval', color: '#3b82f6' };
  if (s === 'delayed_quiet_hours') return { label: 'Delayed (quiet hours)', color: '#8b5cf6' };
  if (s === 'blocked_consent' || s === 'blocked_suppression') return { label: s.replace(/_/g, ' '), color: '#f97316' };
  if (s === 'failed') return { label: 'Failed', color: '#dc2626' };
  if (s === 'reconciliation_required') return { label: 'Reconciliation required', color: '#f97316' };
  return { label: s.replace(/_/g, ' '), color: '#64748b' };
}

export default function SmsPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [conn, setConn] = useState<RcpSmsStatus | undefined>();
  const [numbers, setNumbers] = useState<RcpSmsNumber[]>([]);
  const [drafts, setDrafts] = useState<RcpSmsDraft[]>([]);
  const [pick, setPick] = useState('');
  const [qh, setQh] = useState<RcpSmsQuietHours>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const s = await receptionistApi.getSmsStatus();
    if (!s.backendUp) { setStatus('offline'); return; }
    setConn(s as RcpSmsStatus);
    setQh((s as RcpSmsStatus).quiet_hours || {});
    const [n, d] = await Promise.all([receptionistApi.getSmsNumbers(), receptionistApi.getSmsDrafts()]);
    if (n.backendUp) setNumbers((n as { numbers?: RcpSmsNumber[] }).numbers || []);
    if (d.backendUp) setDrafts((d as { drafts?: RcpSmsDraft[] }).drafts || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function selectNumber() {
    const num = pick || conn?.connection?.sender_number || '';
    if (!num) return;
    setBusy('select'); setMsg('');
    const r = await receptionistApi.selectSmsNumber(num);
    setBusy(''); setMsg(r.backendUp && r.status === 'selected' ? 'Number selected.' : 'Could not select number.');
    await load();
  }
  async function setMode(mode: string) {
    setBusy('mode'); const r = await receptionistApi.setSmsReplyMode(mode);
    setBusy(''); if (!r.backendUp) setMsg('Could not update reply mode.'); await load();
  }
  async function saveQuietHours() {
    setBusy('qh'); const r = await receptionistApi.setSmsQuietHours(qh);
    setBusy(''); setMsg(r.backendUp ? 'Quiet hours saved.' : 'Could not save quiet hours.'); await load();
  }
  async function runHealth() { setBusy('health'); await receptionistApi.runSmsHealth(); setBusy(''); setMsg('Health check queued.'); }
  async function disconnect() { setBusy('disc'); await receptionistApi.disconnectSms(); setBusy(''); await load(); }
  async function retry(id: string) { setBusy(id); await receptionistApi.retrySmsDraft(id); setBusy(''); await load(); }
  async function reconcile(id: string) { setBusy(id); await receptionistApi.reconcileSmsDraft(id); setBusy(''); await load(); }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  const c = conn?.connection;
  const st = STATE_LABEL[c?.state || 'not_connected'] || STATE_LABEL.not_connected;

  return (
    <div className="space-y-6" data-testid="sms-panel">
      {msg && <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</div>}

      <Section title="SMS" sub="Twilio-backed SMS. Quiet hours and consent are enforced server-side; direct replies to a customer who just texted are not delayed." right={
        <GhostButton onClick={load} aria-label="Refresh SMS"><RefreshCw size={14} /></GhostButton>
      }>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <MessageSquare size={16} color="#635BFF" />
              <span className="font-medium">{c?.sender_number || 'No number'}</span>
              <Pill color={st.color}>{st.label}</Pill>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {c?.provider || 'twilio'} · {c?.country || '—'} · SMS: {c?.sms_capable ? 'yes' : 'no'} · MMS: {c?.mms_capable ? 'yes' : 'no'} ·
            {' '}inbound webhook: {c?.inbound_webhook_subscribed ? 'ok' : 'missing'} · delivery webhook: {c?.delivery_webhook_subscribed ? 'ok' : 'missing'}
            {c?.last_error ? <span className="text-red-600"> · error: {c.last_error}</span> : null}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Sender number">
              <div className="flex gap-2">
                <select aria-label="SMS sender number" data-testid="sms-number" value={pick || c?.sender_number || ''}
                  onChange={(e) => setPick(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Select…</option>
                  {numbers.map((n) => <option key={n.sender_number} value={n.sender_number}>{n.sender_number} ({n.country})</option>)}
                </select>
                <PrimaryButton onClick={selectNumber} disabled={busy === 'select'}>Select</PrimaryButton>
              </div>
            </Field>
            <Field label="Reply mode">
              <select aria-label="SMS reply mode" data-testid="sms-reply-mode" value={conn?.reply_mode || 'draft_only'}
                onChange={(e) => setMode(e.target.value)} disabled={busy === 'mode'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {REPLY_MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <GhostButton onClick={runHealth} disabled={busy === 'health'}>Run health check</GhostButton>
            {c?.connected ? <GhostButton onClick={disconnect} disabled={busy === 'disc'} aria-label="Disconnect SMS">Disconnect</GhostButton> : null}
          </div>
        </Card>
      </Section>

      <Section title="Quiet hours" sub="No automated SMS is sent during quiet hours in the configured timezone; blocked messages are queued until allowed.">
        <Card>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Enabled">
              <select aria-label="Quiet hours enabled" data-testid="sms-qh-enabled" value={qh.enabled === false ? 'off' : 'on'}
                onChange={(e) => setQh({ ...qh, enabled: e.target.value === 'on' })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="on">On</option><option value="off">Off</option>
              </select>
            </Field>
            <Field label="Start hour">
              <input aria-label="Quiet hours start" type="number" min={0} max={23} value={qh.start_hour ?? 21}
                onChange={(e) => setQh({ ...qh, start_hour: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
            <Field label="End hour">
              <input aria-label="Quiet hours end" type="number" min={0} max={23} value={qh.end_hour ?? 8}
                onChange={(e) => setQh({ ...qh, end_hour: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
            <Field label="Timezone">
              <input aria-label="Quiet hours timezone" type="text" value={qh.timezone ?? 'UTC'} placeholder="UTC"
                onChange={(e) => setQh({ ...qh, timezone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="mt-3"><PrimaryButton onClick={saveQuietHours} disabled={busy === 'qh'}>Save quiet hours</PrimaryButton></div>
        </Card>
      </Section>

      <Section title="Drafts & replies" sub="Approve in the Approvals tab. Segment estimate shown before send. Delivered comes from provider callbacks — never a toast.">
        {drafts.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No SMS drafts yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {drafts.map((d) => {
              const ds = draftState(d);
              return (
                <Card key={d.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Pill color={ds.color}>{ds.label}</Pill>
                        <span>to {d.customer_number || '—'}</span>
                        <Pill color="#64748b">{d.segments ?? 1} seg · {d.encoding || 'GSM-7'}</Pill>
                        {d.delayed_until ? <span className="flex items-center gap-1"><Clock size={11} /> until {fmtDate(d.delayed_until)}</span> : null}
                        <span>· {fmtDate(d.updated_at)}</span>
                      </div>
                      {d.text ? <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">{d.text.slice(0, 200)}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {d.status === 'failed' && <GhostButton onClick={() => retry(d.id)} disabled={busy === d.id} aria-label="Retry send"><Send size={14} /> Retry</GhostButton>}
                      {d.status === 'reconciliation_required' && <GhostButton onClick={() => reconcile(d.id)} disabled={busy === d.id} aria-label="Reconcile"><AlertTriangle size={14} /> Reconcile</GhostButton>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
