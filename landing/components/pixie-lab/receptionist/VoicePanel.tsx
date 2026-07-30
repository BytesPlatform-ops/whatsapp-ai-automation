'use client';

import { useCallback, useEffect, useState } from 'react';
import { Phone, PhoneOutgoing, RefreshCw, ShieldCheck, ArrowRightLeft } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpVoiceStatus, RcpVoiceNumber, RcpVoiceCall } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, Pill, PrimaryButton, GhostButton, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';
const VOICE = '#7C3AED';

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  not_connected: { label: 'Not connected', color: '#64748b' },
  credentials_invalid: { label: 'Credentials invalid', color: '#dc2626' },
  no_number: { label: 'No number', color: '#f59e0b' },
  server_auth_missing: { label: 'Server auth missing', color: '#f59e0b' },
  assistant_missing: { label: 'Assistant missing', color: '#f59e0b' },
  inbound_unavailable: { label: 'Inbound unavailable', color: '#f59e0b' },
  ready_for_inbound: { label: 'Ready for inbound', color: '#16a34a' },
  ready_for_outbound: { label: 'Ready for outbound', color: '#16a34a' },
  ready_inbound_outbound: { label: 'Ready (inbound + outbound)', color: '#16a34a' },
  needs_reconnect: { label: 'Needs reconnect', color: '#dc2626' },
};

const CALL_COLOR: Record<string, string> = {
  completed: '#16a34a', in_progress: '#16a34a', transferred: '#0ea5e9', ringing: '#f59e0b',
  queued: '#f59e0b', voicemail: '#8b5cf6', no_answer: '#64748b', busy: '#64748b',
  failed: '#dc2626', rejected: '#dc2626', reconciliation_required: '#f97316',
};

export default function VoicePanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [conn, setConn] = useState<RcpVoiceStatus | undefined>();
  const [numbers, setNumbers] = useState<RcpVoiceNumber[]>([]);
  const [calls, setCalls] = useState<RcpVoiceCall[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [outTo, setOutTo] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const s = await receptionistApi.getVoiceStatus();
    if (!s.backendUp) { setStatus('offline'); return; }
    setConn(s as RcpVoiceStatus);
    const [n, c] = await Promise.all([receptionistApi.getVoiceNumbers(), receptionistApi.getVoiceCalls()]);
    if (n.backendUp) setNumbers((n as { numbers?: RcpVoiceNumber[] }).numbers || []);
    if (c.backendUp) setCalls((c as { calls?: RcpVoiceCall[] }).calls || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect() {
    if (!apiKey) return;
    setBusy('connect'); setMsg('');
    const r = await receptionistApi.connectVoice(apiKey, secret);
    setApiKey(''); setSecret('');
    setBusy(''); setMsg(r.backendUp && r.status === 'connected' ? 'Vapi connected.' : 'Could not connect Vapi.');
    await load();
  }
  async function toggle(key: 'inbound' | 'outbound' | 'recording', val: boolean) {
    setBusy(key); await receptionistApi.setVoiceSettings({ [key]: val }); setBusy(''); await load();
  }
  async function startOutbound() {
    if (!outTo) return;
    setBusy('outbound'); const r = await receptionistApi.startVoiceOutbound(outTo);
    setBusy(''); setMsg(r.backendUp && r.status === 'queued' ? 'Call queued.' : `Not placed: ${(r as { status?: string }).status || 'blocked'}.`);
    setOutTo(''); await load();
  }
  async function reconcile(id: string) { setBusy(id); await receptionistApi.reconcileVoiceCall(id); setBusy(''); await load(); }
  async function runHealth() { setBusy('health'); await receptionistApi.runVoiceHealth(); setBusy(''); setMsg('Health check queued.'); }
  async function disconnect() { setBusy('disc'); await receptionistApi.disconnectVoice(); setBusy(''); await load(); }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  const c = conn?.connection;
  const st = STATE_LABEL[c?.state || 'not_connected'] || STATE_LABEL.not_connected;
  const rec = conn?.recording_policy;

  return (
    <div className="space-y-6" data-testid="voice-panel">
      {msg && <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</div>}

      <Section title="Vapi connection" sub="Vapi handles telephony, speech and turn-taking. Pixie stays authoritative for all business logic, consent and booking." right={
        <GhostButton onClick={load} aria-label="Refresh voice"><RefreshCw size={14} /></GhostButton>
      }>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Phone size={16} color={VOICE} />
              <span className="font-medium">{c?.account_id || 'Not connected'}</span>
              <Pill color={st.color}>{st.label}</Pill>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            server auth: {c?.server_auth ? 'ok' : 'missing'} · inbound: {c?.inbound_enabled ? 'on' : 'off'} ·
            {' '}outbound: {c?.outbound_enabled ? 'on' : 'off'} · recording: {c?.recording_enabled ? 'on' : 'off (default)'}
            {c?.last_error ? <span className="text-red-600"> · error: {c.last_error}</span> : null}
          </p>

          {!c?.connected ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Vapi private API key">
                <input aria-label="Vapi API key" type="password" value={apiKey} placeholder="vapi-..."
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <Field label="Server callback secret (optional)">
                <div className="flex gap-2">
                  <input aria-label="Vapi server secret" type="password" value={secret} placeholder="auto-generated if blank"
                    onChange={(e) => setSecret(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <PrimaryButton onClick={connect} disabled={busy === 'connect' || !apiKey} tone={VOICE}>Connect</PrimaryButton>
                </div>
              </Field>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" aria-label="Inbound enabled" checked={!!c?.inbound_enabled} onChange={(e) => toggle('inbound', e.target.checked)} disabled={busy === 'inbound'} /> Inbound
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" aria-label="Outbound enabled" data-testid="voice-outbound-toggle" checked={!!c?.outbound_enabled} onChange={(e) => toggle('outbound', e.target.checked)} disabled={busy === 'outbound'} /> Outbound
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" aria-label="Recording enabled" checked={!!c?.recording_enabled} onChange={(e) => toggle('recording', e.target.checked)} disabled={busy === 'recording'} /> Recording
              </label>
              <GhostButton onClick={runHealth} disabled={busy === 'health'}>Health check</GhostButton>
              <GhostButton onClick={disconnect} disabled={busy === 'disc'} aria-label="Disconnect voice">Disconnect</GhostButton>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Phone numbers" sub="Vapi-managed, imported Twilio or SIP numbers. Readiness is truthful per capability.">
        {numbers.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No numbers configured.</p></Card>
        ) : (
          <div className="space-y-2">
            {numbers.map((n) => (
              <Card key={n.phone_number_id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{n.number} <span className="text-xs text-slate-400">({n.source})</span></span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <Pill color={n.inbound_capable ? '#16a34a' : '#64748b'}>in</Pill>
                    <Pill color={n.outbound_capable ? '#16a34a' : '#64748b'}>out</Pill>
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Compliance" sub="Recording is off by default; DNC, suppression and quiet hours are enforced server-side.">
        <Card>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1"><ShieldCheck size={13} color={rec?.enabled ? '#dc2626' : '#16a34a'} />
              recording: {rec?.enabled ? `on (${rec?.mode})` : 'off'}</span>
            <span className="flex items-center gap-1"><ArrowRightLeft size={13} />
              transfer destinations: {(conn?.transfer_destinations || []).filter((d) => d.verified).length}</span>
          </div>
        </Card>
      </Section>

      <Section title="Calls" right={c?.outbound_enabled ? (
        <div className="flex gap-2">
          <input aria-label="Outbound number" type="tel" value={outTo} placeholder="+15551234567"
            onChange={(e) => setOutTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
          <PrimaryButton onClick={startOutbound} disabled={busy === 'outbound' || !outTo} tone={VOICE}><PhoneOutgoing size={13} /> Call</PrimaryButton>
        </div>
      ) : undefined} sub="Honest call statuses only — a queued request is never shown as completed.">
        {calls.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No calls yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {calls.map((call) => (
              <Card key={call.call_id || call.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Pill color={call.direction === 'outbound' ? '#0ea5e9' : VOICE}>{call.direction}</Pill>
                      <Pill color={CALL_COLOR[call.status || ''] || '#64748b'}>{(call.status || '').replace(/_/g, ' ')}</Pill>
                      <span>{call.caller_number || call.recipient_number || '—'}</span>
                      {call.ended_reason ? <span className="text-slate-400">· {call.ended_reason}</span> : null}
                      {call.duration_seconds ? <span>· {call.duration_seconds}s</span> : null}
                      <span>· {fmtDate(call.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {call.status === 'reconciliation_required' && <GhostButton onClick={() => reconcile(call.call_id || '')} disabled={busy === call.call_id} aria-label="Reconcile call">Reconcile</GhostButton>}
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
