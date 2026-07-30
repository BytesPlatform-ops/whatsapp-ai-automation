'use client';

import { useCallback, useEffect, useState } from 'react';
import { Instagram, MessageCircle, RefreshCw, Send, AlertTriangle } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpMetaMessagingStatus, RcpMetaAsset, RcpMetaDraft, RcpMetaConnection } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, Pill, PrimaryButton, GhostButton, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';
const REPLY_MODES = ['disabled', 'draft_only', 'approval_required', 'direct_reply'] as const;

/** Truthful readiness — never a generic green when the asset can't send. */
const STATE_LABEL: Record<string, { label: string; color: string }> = {
  not_connected: { label: 'Not connected', color: '#64748b' },
  permission_missing: { label: 'Permission missing', color: '#f59e0b' },
  no_instagram_account: { label: 'No Instagram account', color: '#f59e0b' },
  no_facebook_page: { label: 'No Facebook Page', color: '#f59e0b' },
  webhook_not_subscribed: { label: 'Webhook not subscribed', color: '#f59e0b' },
  ready_for_inbound: { label: 'Ready for inbound', color: '#3b82f6' },
  ready_for_replies: { label: 'Ready for replies', color: '#16a34a' },
  needs_reconnect: { label: 'Needs reconnect', color: '#dc2626' },
};

function draftState(d: RcpMetaDraft): { label: string; color: string } {
  const s = d.status || 'generated';
  if (s === 'sent' || s === 'delivered' || s === 'read') return { label: s, color: '#16a34a' };
  if (s === 'provider_pending') return { label: 'Provider pending', color: '#f59e0b' };
  if (s === 'pending_approval') return { label: 'Pending approval', color: '#3b82f6' };
  if (s === 'blocked_by_policy') return { label: 'Blocked by policy', color: '#f97316' };
  if (s === 'failed') return { label: 'Failed', color: '#dc2626' };
  if (s === 'reconciliation_required') return { label: 'Reconciliation required', color: '#f97316' };
  return { label: s.replace(/_/g, ' '), color: '#64748b' };
}

export default function MetaMessagingPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [conn, setConn] = useState<RcpMetaMessagingStatus | undefined>();
  const [accounts, setAccounts] = useState<RcpMetaAsset[]>([]);
  const [pages, setPages] = useState<RcpMetaAsset[]>([]);
  const [drafts, setDrafts] = useState<RcpMetaDraft[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const s = await receptionistApi.getMetaMessagingStatus();
    if (!s.backendUp) { setStatus('offline'); return; }
    setConn(s as RcpMetaMessagingStatus);
    const [a, p, d] = await Promise.all([
      receptionistApi.getMetaAccounts(), receptionistApi.getMetaPages(), receptionistApi.getMetaDrafts()]);
    if (a.backendUp) setAccounts((a as { accounts?: RcpMetaAsset[] }).accounts || []);
    if (p.backendUp) setPages((p as { pages?: RcpMetaAsset[] }).pages || []);
    if (d.backendUp) setDrafts((d as { drafts?: RcpMetaDraft[] }).drafts || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function selectAsset(channel: string, assetId: string) {
    if (!assetId) return;
    setBusy(`select-${channel}`); setMsg('');
    const r = await receptionistApi.selectMetaAsset(channel, assetId);
    setBusy(''); setMsg(r.backendUp && r.status === 'selected' ? `${channel} asset selected.` : 'Could not select asset.');
    await load();
  }
  async function setMode(channel: string, mode: string) {
    setBusy(`mode-${channel}`); setMsg('');
    const r = await receptionistApi.setMetaReplyMode(channel, mode);
    setBusy(''); if (!r.backendUp) setMsg('Could not update reply mode.');
    await load();
  }
  async function runHealth() { setBusy('health'); await receptionistApi.runMetaHealth(); setBusy(''); setMsg('Health check queued.'); }
  async function disconnect(channel: string) { setBusy(`disc-${channel}`); await receptionistApi.disconnectMeta(channel); setBusy(''); await load(); }
  async function retry(id: string) { setBusy(id); await receptionistApi.retryMetaDraft(id); setBusy(''); await load(); }
  async function reconcile(id: string) { setBusy(id); await receptionistApi.reconcileMetaDraft(id); setBusy(''); await load(); }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  return (
    <div className="space-y-6" data-testid="meta-messaging-panel">
      {msg && <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</div>}

      <ChannelCard
        channel="instagram" title="Instagram" icon={<Instagram size={16} color="#E1306C" />}
        accent="#E1306C" conn={conn?.instagram?.connection} replyMode={conn?.instagram?.reply_mode}
        assets={accounts} assetLabel={(a) => `@${a.username || a.instagram_account_id}`}
        assetId={(a) => a.instagram_account_id || ''} busy={busy}
        onSelect={(id) => selectAsset('instagram', id)} onMode={(m) => setMode('instagram', m)}
        onDisconnect={() => disconnect('instagram')} onRefresh={load} onHealth={runHealth} />

      <ChannelCard
        channel="messenger" title="Facebook Messenger" icon={<MessageCircle size={16} color="#0084FF" />}
        accent="#0084FF" conn={conn?.messenger?.connection} replyMode={conn?.messenger?.reply_mode}
        assets={pages} assetLabel={(p) => p.page_name || p.page_id || ''}
        assetId={(p) => p.page_id || ''} busy={busy}
        onSelect={(id) => selectAsset('messenger', id)} onMode={(m) => setMode('messenger', m)}
        onDisconnect={() => disconnect('messenger')} onRefresh={load} onHealth={runHealth} />

      <Section title="Drafts & replies" sub="Approve in the Approvals tab. Delivered/read come from provider webhooks — never a toast.">
        {drafts.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No Instagram or Messenger drafts yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {drafts.map((d) => {
              const ds = draftState(d);
              return (
                <Card key={d.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Pill color={d.channel === 'messenger' ? '#0084FF' : '#E1306C'}>{d.channel}</Pill>
                        <Pill color={ds.color}>{ds.label}</Pill>
                        <span>to {d.sender_id || '—'}</span>
                        {d.tag_required ? <Pill color="#f59e0b">tag required</Pill> : null}
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

function ChannelCard({ channel, title, icon, accent, conn, replyMode, assets, assetLabel, assetId, busy, onSelect, onMode, onDisconnect, onRefresh, onHealth }: {
  channel: string; title: string; icon: React.ReactNode; accent: string;
  conn?: RcpMetaConnection; replyMode?: string; assets: RcpMetaAsset[];
  assetLabel: (a: RcpMetaAsset) => string; assetId: (a: RcpMetaAsset) => string; busy: string;
  onSelect: (id: string) => void; onMode: (m: string) => void; onDisconnect: () => void;
  onRefresh: () => void; onHealth: () => void;
}) {
  const st = STATE_LABEL[conn?.state || 'not_connected'] || STATE_LABEL.not_connected;
  const selected = conn?.instagram_account_id || conn?.page_id || '';
  const [pick, setPick] = useState('');
  return (
    <Section title={title} sub="Meta messaging. Live replies require an open messaging window; Instagram has no message tags." right={
      <GhostButton onClick={onRefresh} aria-label={`Refresh ${title}`}><RefreshCw size={14} /></GhostButton>
    }>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {icon}
            <span className="font-medium">{conn?.username ? `@${conn.username}` : conn?.page_name || selected || 'No asset'}</span>
            <Pill color={st.color}>{st.label}</Pill>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          webhook: {conn?.webhook_subscribed ? 'subscribed' : 'not subscribed'} ·
          {' '}last inbound: {conn?.last_inbound_at ? fmtDate(conn.last_inbound_at) : '—'} ·
          {' '}last send: {conn?.last_send_at ? fmtDate(conn.last_send_at) : '—'}
          {conn?.last_error ? <span className="text-red-600"> · error: {conn.last_error}</span> : null}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={channel === 'instagram' ? 'Instagram account' : 'Facebook Page'}>
            <div className="flex gap-2">
              <select aria-label={`${title} asset`} data-testid={`${channel}-asset`} value={pick || selected}
                onChange={(e) => setPick(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {assets.map((a) => <option key={assetId(a)} value={assetId(a)}>{assetLabel(a)}</option>)}
              </select>
              <PrimaryButton onClick={() => onSelect(pick || selected)} disabled={busy === `select-${channel}` || !(pick || selected)} tone={accent}>Select</PrimaryButton>
            </div>
          </Field>
          <Field label="Reply mode">
            <select aria-label={`${title} reply mode`} data-testid={`${channel}-reply-mode`} value={replyMode || 'draft_only'}
              onChange={(e) => onMode(e.target.value)} disabled={busy === `mode-${channel}`}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {REPLY_MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <GhostButton onClick={onHealth} disabled={busy === 'health'}>Run health check</GhostButton>
          {conn?.connected ? <GhostButton onClick={onDisconnect} disabled={busy === `disc-${channel}`} aria-label={`Disconnect ${title}`}>Disconnect</GhostButton> : null}
        </div>
      </Card>
    </Section>
  );
}
