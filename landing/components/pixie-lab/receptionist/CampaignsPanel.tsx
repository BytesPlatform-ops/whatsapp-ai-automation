'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, RefreshCw, Plus, Play, Pause, X, CheckCircle2 } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpOutboundCampaign, RcpOutboundStep, RcpOutboundContent, RcpOutboundAnalytics } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, Pill, PrimaryButton, GhostButton, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';
const ACCENT = '#DB2777';
const PURPOSES = ['support', 'transactional', 'booking', 'follow_up', 're_engagement', 'promotional'] as const;
const CHANNELS = ['sms', 'whatsapp', 'email', 'telegram', 'instagram', 'messenger'] as const;

const STATUS_COLOR: Record<string, string> = {
  draft: '#64748b', pending_approval: '#3b82f6', approved: '#16a34a', scheduled: '#0ea5e9',
  preparing: '#f59e0b', active: '#16a34a', paused: '#f97316', completed: '#16a34a',
  cancelled: '#dc2626', failed: '#dc2626', blocked_policy: '#dc2626', archived: '#94a3b8',
  partially_completed: '#f59e0b',
};

export default function CampaignsPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [campaigns, setCampaigns] = useState<RcpOutboundCampaign[]>([]);
  const [flags, setFlags] = useState<{ feature_enabled?: boolean; send_enabled?: boolean }>({});
  const [selected, setSelected] = useState<string>('');
  const [detail, setDetail] = useState<{ campaign?: RcpOutboundCampaign; steps?: RcpOutboundStep[]; content?: RcpOutboundContent[]; approval_valid?: boolean } | undefined>();
  const [analytics, setAnalytics] = useState<RcpOutboundAnalytics | undefined>();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<string>('support');
  const [channel, setChannel] = useState<string>('sms');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await receptionistApi.listOutboundCampaigns();
    if (!r.backendUp) { setStatus('offline'); return; }
    setCampaigns((r as { campaigns?: RcpOutboundCampaign[] }).campaigns || []);
    setFlags({ feature_enabled: (r as { feature_enabled?: boolean }).feature_enabled, send_enabled: (r as { send_enabled?: boolean }).send_enabled });
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setSelected(id);
    const [d, a] = await Promise.all([receptionistApi.getOutboundCampaign(id), receptionistApi.getOutboundAnalytics(id)]);
    if (d.backendUp) setDetail(d as never);
    if (a.backendUp) setAnalytics((a as { analytics?: RcpOutboundAnalytics }).analytics);
  }, []);

  async function create() {
    if (!name) return;
    setBusy('create'); setMsg('');
    const r = await receptionistApi.createOutboundCampaign({ name, purpose, channels: [channel] });
    setName('');
    setBusy('');
    if (r.backendUp && r.campaign) { await load(); await openDetail(r.campaign.id); }
  }
  async function action(id: string, act: string) {
    setBusy(act);
    const r = await receptionistApi.outboundCampaignAction(id, act);
    setBusy(''); setMsg(`${act}: ${(r as { status?: string; errors?: string[] }).status || ''}${(r as { errors?: string[] }).errors ? ' — ' + (r as { errors?: string[] }).errors!.join(', ') : ''}`);
    await load(); if (selected) await openDetail(selected);
  }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  return (
    <div className="space-y-6" data-testid="campaigns-panel">
      {msg && <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</div>}
      {!flags.feature_enabled && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Campaigns are disabled for this workspace. Enable them in configuration before launching.
        </div>
      )}

      <Section title="Outbound campaigns" sub="Consent-based orchestration over your existing channels. Sending, promotional purpose and voice campaigns are off by default." right={
        <div className="flex items-center gap-2">
          <Pill color={flags.send_enabled ? '#16a34a' : '#64748b'}>{flags.send_enabled ? 'send on' : 'send off (default)'}</Pill>
          <GhostButton onClick={load} aria-label="Refresh campaigns"><RefreshCw size={14} /></GhostButton>
        </div>
      }>
        <Card>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Name"><input aria-label="Campaign name" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></Field>
            <Field label="Purpose"><select aria-label="Campaign purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {PURPOSES.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}</select></Field>
            <Field label="Channel"><select aria-label="Campaign channel" value={channel} onChange={(e) => setChannel(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            <div className="flex items-end"><PrimaryButton onClick={create} disabled={busy === 'create' || !name} tone={ACCENT}><Plus size={14} /> Create</PrimaryButton></div>
          </div>
        </Card>

        {campaigns.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No campaigns yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <Card key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button className="flex items-center gap-2 text-left text-sm" onClick={() => openDetail(c.id)}>
                    <Megaphone size={15} color={ACCENT} />
                    <span className="font-medium">{c.name}</span>
                    <Pill color={STATUS_COLOR[c.status || 'draft'] || '#64748b'}>{(c.status || '').replace(/_/g, ' ')}</Pill>
                    <span className="text-xs text-slate-400">{c.purpose} · {(c.channels || []).join(', ')}</span>
                  </button>
                  <span className="text-xs text-slate-400">{fmtDate(c.updated_at)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {detail?.campaign && (
        <Section title={`Campaign — ${detail.campaign.name}`} sub={`Status: ${detail.campaign.status} · approval ${detail.approval_valid ? 'valid' : 'invalid'}`}>
          <Card>
            <div className="text-xs text-slate-500">
              Steps: {(detail.steps || []).map((s) => `${s.order}:${s.channel}`).join(' → ') || 'none'}
              {' · '}Content: {(detail.content || []).length} version(s)
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <GhostButton onClick={() => action(detail.campaign!.id, 'request-approval')} disabled={busy === 'request-approval'}>Request approval</GhostButton>
              <GhostButton onClick={() => action(detail.campaign!.id, 'approve')} disabled={busy === 'approve'} aria-label="Approve campaign"><CheckCircle2 size={14} /> Approve</GhostButton>
              <PrimaryButton onClick={() => action(detail.campaign!.id, 'start')} disabled={busy === 'start' || !detail.approval_valid} tone={ACCENT}><Play size={14} /> Start</PrimaryButton>
              <GhostButton onClick={() => action(detail.campaign!.id, 'pause')} disabled={busy === 'pause'} aria-label="Pause campaign"><Pause size={14} /> Pause</GhostButton>
              <GhostButton onClick={() => action(detail.campaign!.id, 'cancel')} disabled={busy === 'cancel'} aria-label="Cancel campaign"><X size={14} /> Cancel</GhostButton>
            </div>
          </Card>

          {analytics && (
            <Card>
              <div className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
                {([['audience', 'Audience'], ['eligible', 'Eligible'], ['sent', 'Sent'], ['replied', 'Replied'],
                   ['conversions', 'Conversions'], ['opted_out', 'Opt-outs']] as [keyof RcpOutboundAnalytics, string][]).map(([k, label]) => (
                  <div key={k}>
                    <div className="text-[var(--pl-text-muted)] text-xs">{label}</div>
                    <div className="font-mono">{(analytics[k] as number) ?? 0}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Section>
      )}
    </div>
  );
}
