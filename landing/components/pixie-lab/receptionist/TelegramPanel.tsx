'use client';

import { useCallback, useEffect, useState } from 'react';
import { Send as SendIcon, RefreshCw, AlertTriangle, Bot, Briefcase } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpTelegramStatus, RcpTelegramConnection, RcpTelegramDraft } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, Pill, PrimaryButton, GhostButton, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';
const REPLY_MODES = ['disabled', 'draft_only', 'approval_required', 'direct_reply'] as const;
const TG = '#229ED9';

const BOT_STATE: Record<string, { label: string; color: string }> = {
  not_connected: { label: 'Not connected', color: '#64748b' },
  invalid_token: { label: 'Invalid token', color: '#dc2626' },
  bot_identity_unverified: { label: 'Bot unverified', color: '#f59e0b' },
  webhook_missing: { label: 'Webhook missing', color: '#f59e0b' },
  webhook_unhealthy: { label: 'Webhook unhealthy', color: '#f59e0b' },
  standard_bot_ready: { label: 'Standard bot ready', color: '#16a34a' },
  needs_reconnect: { label: 'Needs reconnect', color: '#dc2626' },
};
const BIZ_STATE: Record<string, { label: string; color: string }> = {
  business_mode_unavailable: { label: 'Business mode off', color: '#64748b' },
  business_connection_missing: { label: 'No business connection', color: '#f59e0b' },
  business_connection_permission_missing: { label: 'Permission missing', color: '#f59e0b' },
  business_connection_paused: { label: 'Business paused', color: '#f97316' },
  ready_for_business_messages: { label: 'Ready for business', color: '#16a34a' },
  not_connected: { label: 'Not connected', color: '#64748b' },
  needs_reconnect: { label: 'Needs reconnect', color: '#dc2626' },
};

function draftState(d: RcpTelegramDraft): { label: string; color: string } {
  const s = d.status || 'generated';
  if (s === 'sent' || s === 'provider_pending') return { label: s === 'sent' ? 'sent' : 'Provider confirmed', color: s === 'sent' ? '#16a34a' : '#f59e0b' };
  if (s === 'pending_approval') return { label: 'Pending approval', color: '#3b82f6' };
  if (s === 'blocked_by_policy') return { label: 'Blocked by policy', color: '#f97316' };
  if (s === 'failed') return { label: 'Failed', color: '#dc2626' };
  if (s === 'edited') return { label: 'Edited', color: '#8b5cf6' };
  if (s === 'reconciliation_required') return { label: 'Reconciliation required', color: '#f97316' };
  return { label: s.replace(/_/g, ' '), color: '#64748b' };
}

export default function TelegramPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [conn, setConn] = useState<RcpTelegramStatus | undefined>();
  const [drafts, setDrafts] = useState<RcpTelegramDraft[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const s = await receptionistApi.getTelegramStatus();
    if (!s.backendUp) { setStatus('offline'); return; }
    setConn(s as RcpTelegramStatus);
    const d = await receptionistApi.getTelegramDrafts();
    if (d.backendUp) setDrafts((d as { drafts?: RcpTelegramDraft[] }).drafts || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect() {
    if (!token) return;
    setBusy('connect'); setMsg('');
    const r = await receptionistApi.connectTelegram(token);
    setToken('');
    setBusy(''); setMsg(r.backendUp && r.status === 'connected' ? `Connected @${r.bot?.bot_username}.` : 'Could not connect bot.');
    await load();
  }
  async function configureWebhook(rotate = false) {
    setBusy('webhook'); const r = await receptionistApi.configureTelegramWebhook(rotate);
    setBusy(''); setMsg(r.backendUp ? (rotate ? 'Secret rotated + webhook set.' : 'Webhook configured.') : 'Webhook failed.'); await load();
  }
  async function setMode(mode: string, val: string) {
    setBusy(`mode-${mode}`); const r = await receptionistApi.setTelegramReplyMode(mode, val);
    setBusy(''); if (!r.backendUp) setMsg('Could not update reply mode.'); await load();
  }
  async function toggleBusiness(enable: boolean) {
    setBusy('biz'); await receptionistApi.setTelegramMode({ business: enable }); setBusy(''); await load();
  }
  async function runHealth() { setBusy('health'); await receptionistApi.runTelegramHealth(); setBusy(''); setMsg('Health check queued.'); }
  async function disconnect() { setBusy('disc'); await receptionistApi.disconnectTelegram(); setBusy(''); await load(); }
  async function retry(id: string) { setBusy(id); await receptionistApi.retryTelegramDraft(id); setBusy(''); await load(); }
  async function reconcile(id: string) { setBusy(id); await receptionistApi.reconcileTelegramDraft(id); setBusy(''); await load(); }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  const c = conn?.connection;
  const bs = BOT_STATE[c?.state || 'not_connected'] || BOT_STATE.not_connected;
  const biz = c?.business;
  const bz = BIZ_STATE[biz?.state || 'business_mode_unavailable'] || BIZ_STATE.business_mode_unavailable;

  return (
    <div className="space-y-6" data-testid="telegram-panel">
      {msg && <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</div>}

      <Section title="Bot" sub="Official Telegram Bot API. A standard bot never makes unsolicited first contact — the user must start the chat." right={
        <GhostButton onClick={load} aria-label="Refresh Telegram"><RefreshCw size={14} /></GhostButton>
      }>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Bot size={16} color={TG} />
              <span className="font-medium">{c?.bot_username ? `@${c.bot_username}` : 'No bot'}</span>
              <Pill color={bs.color}>{bs.label}</Pill>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            bot id: {c?.bot_id || '—'} · webhook: {c?.webhook_subscribed ? 'subscribed' : 'missing'} ·
            {' '}updates: {(c?.allowed_updates || []).length} · last inbound: {c?.last_inbound_at ? fmtDate(c.last_inbound_at) : '—'}
            {c?.last_error ? <span className="text-red-600"> · error: {c.last_error}</span> : null}
          </p>

          {!c?.connected ? (
            <div className="mt-3">
              <Field label="Bot token">
                <div className="flex gap-2">
                  <input aria-label="Telegram bot token" type="password" value={token} placeholder="123456:ABC-..."
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <PrimaryButton onClick={connect} disabled={busy === 'connect' || !token} tone={TG}>Connect</PrimaryButton>
                </div>
              </Field>
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Standard reply mode">
                <select aria-label="Telegram bot reply mode" data-testid="tg-bot-reply-mode" value={conn?.reply_mode || 'draft_only'}
                  onChange={(e) => setMode('bot', e.target.value)} disabled={busy === 'mode-bot'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  {REPLY_MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                </select>
              </Field>
              <Field label="Webhook">
                <div className="flex gap-2">
                  <PrimaryButton onClick={() => configureWebhook(false)} disabled={busy === 'webhook'} tone={TG}>Configure</PrimaryButton>
                  <GhostButton onClick={() => configureWebhook(true)} disabled={busy === 'webhook'} aria-label="Rotate webhook secret">Rotate secret</GhostButton>
                </div>
              </Field>
            </div>
          )}

          {c?.connected ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <GhostButton onClick={runHealth} disabled={busy === 'health'}>Run health check</GhostButton>
              <GhostButton onClick={disconnect} disabled={busy === 'disc'} aria-label="Disconnect Telegram">Disconnect</GhostButton>
            </div>
          ) : null}
        </Card>
      </Section>

      <Section title="Telegram Business" sub="Connected-bot mode. Sends require an active Business connection with reply rights; inline keyboards fall back to text.">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Briefcase size={16} color={TG} />
              <span className="font-medium">{biz?.business_connection_id || 'Not connected'}</span>
              <Pill color={bz.color}>{bz.label}</Pill>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" aria-label="Enable business mode" data-testid="tg-business-enabled"
                checked={!!c?.business_enabled} onChange={(e) => toggleBusiness(e.target.checked)} disabled={busy === 'biz'} />
              Enable business mode
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            can reply: {biz?.can_reply ? 'yes' : 'no'} · paused: {biz?.paused ? 'yes' : 'no'} ·
            {' '}last inbound: {biz?.last_inbound_at ? fmtDate(biz.last_inbound_at) : '—'}
          </p>
          {c?.business_enabled ? (
            <div className="mt-3">
              <Field label="Business reply mode">
                <select aria-label="Telegram business reply mode" data-testid="tg-business-reply-mode" value={conn?.business_reply_mode || 'draft_only'}
                  onChange={(e) => setMode('business', e.target.value)} disabled={busy === 'mode-business'}
                  className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  {REPLY_MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                </select>
              </Field>
            </div>
          ) : null}
        </Card>
      </Section>

      <Section title="Drafts & replies" sub="Approve in the Approvals tab. Telegram confirms provider acceptance only — never delivered/read.">
        {drafts.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No Telegram drafts yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {drafts.map((d) => {
              const ds = draftState(d);
              return (
                <Card key={d.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Pill color={d.mode === 'business' ? '#0ea5e9' : TG}>{d.mode || 'bot'}</Pill>
                        <Pill color={ds.color}>{ds.label}</Pill>
                        <span>to {d.chat_id || '—'}</span>
                        <span>· {fmtDate(d.updated_at)}</span>
                      </div>
                      {d.text ? <p className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">{d.text.slice(0, 200)}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {d.status === 'failed' && <GhostButton onClick={() => retry(d.id)} disabled={busy === d.id} aria-label="Retry send"><SendIcon size={14} /> Retry</GhostButton>}
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
