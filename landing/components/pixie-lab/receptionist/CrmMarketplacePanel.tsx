'use client';

import { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw, Plug, Play, Pause } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpCrmCatalogEntry, RcpCrmConnection, RcpCrmConflict, RcpCrmAnalytics } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, Pill, PrimaryButton, GhostButton, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';
const ACCENT = '#0EA5E9';

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  not_connected: { label: 'Available', color: '#64748b' },
  credentials_invalid: { label: 'Credentials invalid', color: '#dc2626' },
  permission_missing: { label: 'Permission missing', color: '#f59e0b' },
  sync_paused: { label: 'Needs configuration', color: '#f59e0b' },
  connected: { label: 'Connected', color: '#16a34a' },
  reconnect_required: { label: 'Reconnect required', color: '#dc2626' },
};

export default function CrmMarketplacePanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [catalog, setCatalog] = useState<RcpCrmCatalogEntry[]>([]);
  const [connections, setConnections] = useState<RcpCrmConnection[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<string>('');
  const [conn, setConn] = useState<RcpCrmConnection | undefined>();
  const [conflicts, setConflicts] = useState<RcpCrmConflict[]>([]);
  const [analytics, setAnalytics] = useState<RcpCrmAnalytics | undefined>();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await receptionistApi.getCrmCatalog();
    if (!r.backendUp) { setStatus('offline'); return; }
    setCatalog((r as { catalog?: RcpCrmCatalogEntry[] }).catalog || []);
    setConnections((r as { connections?: RcpCrmConnection[] }).connections || []);
    setEnabled(!!(r as { marketplace_enabled?: boolean }).marketplace_enabled);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  const connState = useCallback((provider: string) => connections.find((c) => c.provider === provider), [connections]);

  const openProvider = useCallback(async (provider: string) => {
    setSelected(provider);
    const [s, cf, an] = await Promise.all([
      receptionistApi.getCrmStatus(provider), receptionistApi.getCrmConflicts(provider), receptionistApi.getCrmAnalytics(provider)]);
    if (s.backendUp) setConn((s as { connection?: RcpCrmConnection }).connection);
    if (cf.backendUp) setConflicts((cf as { conflicts?: RcpCrmConflict[] }).conflicts || []);
    if (an.backendUp) setAnalytics((an as { analytics?: RcpCrmAnalytics }).analytics);
  }, []);

  async function connect(provider: string) {
    setBusy(`connect-${provider}`); setMsg('');
    const r = await receptionistApi.connectCrm(provider, { access_token: token || 'demo', account_id: `${provider}_acct_1` });
    setToken('');
    setBusy(''); setMsg(r.backendUp && r.status === 'connected' ? `${provider} connected (import-only).` : 'Could not connect.');
    await load(); await openProvider(provider);
  }
  async function action(provider: string, act: string) {
    setBusy(act); const r = await receptionistApi.crmProviderAction(provider, act);
    setBusy(''); setMsg(`${act}: ${(r as { status?: string }).status || ''}`); await load();
    if (selected) await openProvider(selected);
  }
  async function importObjects(provider: string) { setBusy('import'); await receptionistApi.crmImport(provider, 'contact'); setBusy(''); setMsg('Import queued.'); }
  async function syncNow(provider: string) { setBusy('sync'); await receptionistApi.crmSyncNow(provider); setBusy(''); setMsg('Sync queued.'); }
  async function resolve(provider: string, id: string, res: string) { setBusy(id); await receptionistApi.resolveCrmConflict(provider, id, res); setBusy(''); await openProvider(provider); }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  return (
    <div className="space-y-6" data-testid="crm-marketplace-panel">
      {msg && <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{msg}</div>}
      {!enabled && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The CRM marketplace is disabled for this workspace. External writes and sync stay off until enabled.
        </div>
      )}

      <Section title="CRM marketplace" sub="Replaceable connectors that map into your canonical Pixie data. New connections are import-only; external writes stay off by default." right={
        <GhostButton onClick={load} aria-label="Refresh marketplace"><RefreshCw size={14} /></GhostButton>
      }>
        <div className="grid gap-2 sm:grid-cols-2">
          {catalog.map((c) => {
            const cs = connState(c.provider);
            const st = STATE_LABEL[cs?.state || 'not_connected'] || STATE_LABEL.not_connected;
            return (
              <Card key={c.provider}>
                <div className="flex items-center justify-between gap-2">
                  <button className="flex items-center gap-2 text-left text-sm" onClick={() => openProvider(c.provider)}>
                    <Database size={15} color={ACCENT} />
                    <span className="font-medium">{c.name}</span>
                    <Pill color={st.color}>{st.label}</Pill>
                  </button>
                  <span className="text-[11px] text-slate-400">{c.label}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  objects: {(c.supported_objects || []).join(', ')} · webhooks: {c.webhook_support ? 'yes' : 'no'}
                </p>
                {!cs?.connected && (
                  <div className="mt-2 flex gap-2">
                    <input aria-label={`${c.provider} token`} type="password" value={selected === c.provider ? token : ''} placeholder="token / api key"
                      onChange={(e) => { setSelected(c.provider); setToken(e.target.value); }}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                    <PrimaryButton onClick={() => connect(c.provider)} disabled={busy === `connect-${c.provider}`} tone={ACCENT}><Plug size={13} /> Connect</PrimaryButton>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </Section>

      {conn?.connected && (
        <Section title={`${selected} — sync`} sub={`Direction: ${conn.sync_direction} · write ${conn.write ? 'on' : 'off'} · account ${conn.account_id || '—'}`}>
          <Card>
            <p className="text-xs text-slate-500">
              read: {conn.read ? 'yes' : 'no'} · webhook: {conn.webhook ? 'yes' : 'no'} · last sync: {conn.last_sync_at ? fmtDate(conn.last_sync_at) : '—'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton onClick={() => importObjects(selected)} disabled={busy === 'import'} tone={ACCENT}>Start import</PrimaryButton>
              <GhostButton onClick={() => syncNow(selected)} disabled={busy === 'sync'}>Sync now</GhostButton>
              <GhostButton onClick={() => action(selected, conn.state === 'sync_paused' ? 'resume' : 'pause')} disabled={busy === 'pause' || busy === 'resume'} aria-label="Pause or resume sync">
                {conn.state === 'sync_paused' ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
              </GhostButton>
              <GhostButton onClick={() => action(selected, 'health')} disabled={busy === 'health'}>Health check</GhostButton>
              <GhostButton onClick={() => action(selected, 'disconnect')} disabled={busy === 'disconnect'} aria-label="Disconnect CRM">Disconnect</GhostButton>
            </div>
          </Card>

          {analytics && (
            <Card>
              <div className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-5">
                {([['records_imported', 'Imported'], ['stored_mappings', 'Mappings'], ['open_conflicts', 'Conflicts'],
                   ['outbound_writes', 'Writes'], ['failed_records', 'Failed']] as [keyof RcpCrmAnalytics, string][]).map(([k, label]) => (
                  <div key={k}><div className="text-xs text-[var(--pl-text-muted)]">{label}</div>
                    <div className="font-mono">{(analytics[k] as number) ?? 0}</div></div>
                ))}
              </div>
            </Card>
          )}

          {conflicts.length > 0 && (
            <div className="space-y-2">
              {conflicts.map((cf) => (
                <Card key={cf.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span><Pill color="#f97316">{cf.kind}</Pill> {cf.object_type} · {cf.record_id}</span>
                    <div className="flex gap-2">
                      <GhostButton onClick={() => resolve(selected, cf.id, 'pixie_selected')} disabled={busy === cf.id}>Keep Pixie</GhostButton>
                      <GhostButton onClick={() => resolve(selected, cf.id, 'ignored')} disabled={busy === cf.id}>Ignore</GhostButton>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
