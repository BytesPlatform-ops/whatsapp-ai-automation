'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Send, AlertTriangle } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpWhatsAppStatus, RcpWhatsAppTemplate, RcpWhatsAppDraft } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, Pill, PrimaryButton, GhostButton, RCP_ACCENT, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';
const REPLY_MODES = ['disabled', 'draft_only', 'approval_required', 'direct_reply'] as const;

/** Truthful readiness — never a generic green when the number can't send. */
const STATE_LABEL: Record<string, { label: string; color: string }> = {
  not_connected: { label: 'Not connected', color: '#64748b' },
  no_phone_number: { label: 'No phone number', color: '#f59e0b' },
  webhook_not_subscribed: { label: 'Webhook not subscribed', color: '#f59e0b' },
  ready_for_inbound: { label: 'Ready for inbound', color: '#3b82f6' },
  ready_for_replies: { label: 'Ready for replies', color: '#16a34a' },
  ready_for_templates: { label: 'Ready for templates', color: '#16a34a' },
  needs_reconnect: { label: 'Needs reconnect', color: '#dc2626' },
};

function draftState(d: RcpWhatsAppDraft): { label: string; color: string } {
  const s = d.status || 'generated';
  if (s === 'sent' || s === 'delivered' || s === 'read') return { label: s, color: '#16a34a' };
  if (s === 'provider_pending') return { label: 'Provider pending', color: '#f59e0b' };
  if (s === 'pending_approval') return { label: 'Pending approval', color: '#3b82f6' };
  if (s === 'failed') return { label: 'Failed', color: '#dc2626' };
  if (s === 'reconciliation_required') return { label: 'Reconciliation required', color: '#f97316' };
  return { label: s.replace(/_/g, ' '), color: '#64748b' };
}

export default function WhatsAppPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [conn, setConn] = useState<RcpWhatsAppStatus | undefined>();
  const [templates, setTemplates] = useState<RcpWhatsAppTemplate[]>([]);
  const [drafts, setDrafts] = useState<RcpWhatsAppDraft[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [s, t, d] = await Promise.all([
      receptionistApi.getWhatsAppStatus(), receptionistApi.getWhatsAppTemplates(), receptionistApi.getWhatsAppDrafts()]);
    if (!s.backendUp) { setStatus('offline'); return; }
    setConn(s as RcpWhatsAppStatus);
    if (t.backendUp) setTemplates((t as { templates?: RcpWhatsAppTemplate[] }).templates || []);
    if (d.backendUp) setDrafts((d as { drafts?: RcpWhatsAppDraft[] }).drafts || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setMode(mode: string) {
    setBusy('mode'); setMsg('');
    const r = await receptionistApi.setWhatsAppReplyMode(mode);
    setBusy(''); if (!r.backendUp) setMsg('Could not update reply mode.');
    await load();
  }
  async function syncTemplates() {
    setBusy('sync'); const r = await receptionistApi.syncWhatsAppTemplates();
    setBusy(''); setMsg(r.backendUp ? `Templates synced.` : 'Sync failed.'); await load();
  }
  async function retry(id: string) { setBusy(id); await receptionistApi.retryWhatsAppDraft(id); setBusy(''); await load(); }
  async function reconcile(id: string) { setBusy(id); await receptionistApi.reconcileWhatsAppDraft(id); setBusy(''); await load(); }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  const c = conn?.connection;
  const st = STATE_LABEL[c?.state || 'not_connected'] || STATE_LABEL.not_connected;

  return (
    <div className="space-y-6" data-testid="whatsapp-panel">
      {msg && <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</div>}

      <Section title="WhatsApp Business" sub="Meta WhatsApp Cloud API. Live replies require an open 24h window or an approved template.">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <MessageCircle size={16} color="#25D366" />
              <span className="font-medium">{c?.display_phone_number || 'No number'}</span>
              <Pill color={st.color}>{st.label}</Pill>
            </div>
            <GhostButton onClick={load} aria-label="Refresh WhatsApp"><RefreshCw size={14} /></GhostButton>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            WABA: {c?.waba_name || c?.waba_id || '—'} · {c?.verified_name || '—'} · quality: {c?.quality || '—'} ·
            {' '}webhook: {c?.webhook_subscribed ? 'subscribed' : 'not subscribed'}
          </p>
          <div className="mt-3">
            <Field label="Reply mode">
              <select aria-label="WhatsApp reply mode" data-testid="wa-reply-mode" value={conn?.reply_mode || 'draft_only'}
                onChange={(e) => setMode(e.target.value)} disabled={busy === 'mode'}
                className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {REPLY_MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Templates" right={<PrimaryButton onClick={syncTemplates} disabled={busy === 'sync'}>Sync</PrimaryButton>}
        sub="Only approved templates can send. Provider-approved content is read-only.">
        {templates.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No templates synced yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <Card key={`${t.name}:${t.language}`}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t.name} <span className="text-xs text-slate-400">({t.language})</span></span>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">{t.category} · {t.variables ?? 0} vars</span>
                    <Pill color={t.status === 'APPROVED' ? '#16a34a' : '#dc2626'}>{t.status}</Pill>
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Drafts & replies" sub="Approve in the Approvals tab. Delivered/read come from provider webhooks — never a toast.">
        {drafts.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No WhatsApp drafts yet.</p></Card>
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
                        <span>to {d.wa_id || '—'}</span>
                        {d.template_required ? <Pill color="#f59e0b">template required</Pill> : null}
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
