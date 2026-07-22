'use client';

import { useCallback, useEffect, useState } from 'react';
import { MetaNav } from './MetaNav';
import { MetaHonestyBar } from './MetaHonestyBar';
import { callProxy, card, input, h3, btn } from './metaClient';

/**
 * Ads — Meta Marketing API surface: ad-account selector, campaigns table,
 * account-level insights (spend/impressions/clicks/ctr/cpc), and a PAUSED-only
 * campaign creator. Reads/writes go through the same-origin proxy → FastAPI;
 * the access token never touches the frontend. Demo mode shows seeded data with
 * an honest banner; live mode shows real Graph data or a structured error
 * (reconnect / missing-permission / empty), never faked numbers.
 */

const OBJECTIVES = [
  'OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT',
  'OUTCOME_AWARENESS', 'OUTCOME_SALES', 'OUTCOME_APP_PROMOTION',
];

const CAMPAIGN_STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#6ee7b7', PAUSED: '#fcd34d', ARCHIVED: 'rgba(255,255,255,0.5)',
  DELETED: '#fda4af', CAMPAIGN_PAUSED: '#fcd34d', WITH_ISSUES: '#fda4af',
};

function badge(status: string): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
    color: '#0b0f1a', background: CAMPAIGN_STATUS_COLOR[status] || 'rgba(255,255,255,0.4)',
  };
}

interface AdAccount {
  id: string; name: string; account_id?: string; account_status_label?: string;
  currency?: string; timezone_name?: string;
}
interface Campaign {
  id: string; name: string; status: string; effective_status: string; objective: string;
}
interface Insights {
  spend: number; impressions: number; clicks: number; ctr: number; cpc: number;
}

export function AdsView() {
  const [tenant, setTenant] = useState('demo_tenant');
  const [baseUrl, setBaseUrl] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);

  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selected, setSelected] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [range, setRange] = useState('last_30d');
  const [source, setSource] = useState<string>(''); // 'demo' | 'live'

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [permIssue, setPermIssue] = useState('');
  const [newName, setNewName] = useState('');
  const [newObjective, setNewObjective] = useState('OUTCOME_TRAFFIC');
  const [createMsg, setCreateMsg] = useState('');

  const origin = (baseUrl || 'http://localhost:8000').replace(/\/+$/, '');
  const connected = !!status?.connected;

  // Interpret any endpoint's structured error into the shared banners.
  function absorbError(d: any): boolean {
    if (!d || !d.error) return false;
    if (d.needs_reconnect) setNeedsReconnect(true);
    if (d.error === 'missing_permission') setPermIssue(d.message || 'Missing Meta permission.');
    else if (d.error !== 'not_connected' && d.error !== 'no_ad_account') setErr(d.message || d.error);
    return true;
  }

  const loadAccounts = useCallback(async () => {
    const r = await callProxy(baseUrl, 'GET', `/api/meta/ad-accounts?tenant_id=${encodeURIComponent(tenant)}`);
    const d = r.data || {};
    setSource(d.source || '');
    if (absorbError(d)) { setAccounts([]); return; }
    const list: AdAccount[] = d.ad_accounts || [];
    setAccounts(list);
    setSelected((prev) => prev || status?.defaults?.ad_account_id || list[0]?.id || '');
  }, [baseUrl, tenant, status]);

  const refresh = useCallback(async () => {
    setLoading(true); setErr(''); setNeedsReconnect(false); setPermIssue('');
    const [st, perm] = await Promise.all([
      callProxy(baseUrl, 'GET', `/api/meta/status?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/meta/permissions?tenant_id=${encodeURIComponent(tenant)}`),
    ]);
    setStatus(st.data ?? null);
    setPermissions(perm.data ?? null);
    setLoading(false);
  }, [baseUrl, tenant]);

  // Load campaigns + insights for the selected ad account.
  const loadAdAccountData = useCallback(async (adAccountId: string) => {
    if (!adAccountId) { setCampaigns([]); setInsights(null); return; }
    setBusy('data'); setErr(''); setPermIssue('');
    const q = `tenant_id=${encodeURIComponent(tenant)}&ad_account_id=${encodeURIComponent(adAccountId)}`;
    const [c, ins] = await Promise.all([
      callProxy(baseUrl, 'GET', `/api/meta/campaigns?${q}`),
      callProxy(baseUrl, 'GET', `/api/meta/insights?${q}&range=${encodeURIComponent(range)}`),
    ]);
    if (!absorbError(c.data)) setCampaigns(c.data?.campaigns || []);
    if (!absorbError(ins.data)) setInsights(ins.data?.insights || null);
    setBusy('');
  }, [baseUrl, tenant, range]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (connected) void loadAccounts(); }, [connected, loadAccounts]);
  useEffect(() => { if (connected && selected) void loadAdAccountData(selected); }, [connected, selected, loadAdAccountData]);

  // OAuth popup — connect or reconnect. Requests the ads feature scope set.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === 'meta-connected') void refresh();
      if (e.data?.type === 'meta-connect-error') setErr(e.data.message || e.data.error || 'Meta connect failed');
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [refresh]);

  function connect() {
    setErr('');
    const url = `${origin}/api/meta/connect/start?tenant_id=${encodeURIComponent(tenant)}&feature=ads`;
    window.open(url, 'pixie-meta', 'width=560,height=720');
  }

  async function chooseAccount(id: string) {
    setSelected(id);
    await callProxy(baseUrl, 'POST', '/api/meta/assets/defaults', { tenant_id: tenant, ad_account_id: id });
  }

  async function createCampaign() {
    if (!newName.trim() || !selected) return;
    setBusy('create'); setCreateMsg(''); setErr('');
    const r = await callProxy(baseUrl, 'POST', '/api/meta/campaigns', {
      tenant_id: tenant, ad_account_id: selected, name: newName.trim(), objective: newObjective,
    });
    setBusy('');
    const d = r.data || {};
    if (d.ok) {
      setCreateMsg(d.note || 'Campaign created (PAUSED).');
      setNewName('');
      await loadAdAccountData(selected);
    } else {
      absorbError(d);
      setCreateMsg('');
    }
  }

  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const cur = accounts.find((a) => a.id === selected)?.currency || 'USD';

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, margin: 0 }}>Ads</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ ...input, width: 130 }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default" style={{ ...input, width: 170 }} />
          <button onClick={() => void refresh()} style={btn('rgba(255,255,255,0.1)')}>Refresh</button>
        </div>
      </div>
      <MetaNav />
      <MetaHonestyBar status={status} storage={null} permissions={permissions} />

      {/* Connection / reconnect banners */}
      {loading ? (
        <div style={{ ...card, marginTop: 16, opacity: 0.7 }}>Loading Meta connection…</div>
      ) : !connected ? (
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={h3}>Not connected</h3>
          <p style={{ fontSize: 13, opacity: 0.75, marginTop: 0 }}>
            Connect a Meta account to load ad accounts, campaigns, and insights.
            {status && !status.configured ? ' (Backend is missing META_APP_ID / META_APP_SECRET — only demo data is available.)' : ''}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={connect} disabled={status && !status.configured} style={btn('#1877f2')}>Connect Meta</button>
          </div>
        </div>
      ) : (
        <>
          {needsReconnect ? (
            <div style={{ ...card, marginTop: 16, borderColor: '#fcd34d' }}>
              <b style={{ color: '#fcd34d' }}>Reconnect needed</b>
              <p style={{ fontSize: 13, opacity: 0.8, margin: '6px 0 10px' }}>
                Your Meta token expired or was revoked. Reconnect to restore ads access.
              </p>
              <button onClick={connect} style={btn('#1877f2')}>Reconnect Meta</button>
            </div>
          ) : null}

          {/* Ad account selector */}
          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ ...h3, margin: 0 }}>Ad account</h3>
              {source === 'demo' ? <span style={{ fontSize: 11, color: '#fcd34d' }}>Demo data — not a real Meta account</span> : null}
            </div>
            {accounts.length === 0 ? (
              <div style={{ opacity: 0.55, fontSize: 13, marginTop: 8 }}>
                {permIssue || 'No ad accounts available for this Meta user.'}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                <select value={selected} onChange={(e) => void chooseAccount(e.target.value)} style={{ ...input, width: 'auto', minWidth: 260 }}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.id}{a.currency ? ` · ${a.currency}` : ''}{a.account_status_label ? ` · ${a.account_status_label}` : ''}
                    </option>
                  ))}
                </select>
                <select value={range} onChange={(e) => setRange(e.target.value)} style={{ ...input, width: 'auto' }}>
                  <option value="last_7d">Last 7d</option>
                  <option value="last_30d">Last 30d</option>
                  <option value="last_90d">Last 90d</option>
                  <option value="maximum">Maximum</option>
                </select>
                {busy === 'data' ? <span style={{ fontSize: 12, opacity: 0.6 }}>Loading…</span> : null}
              </div>
            )}
          </div>

          {/* Insights */}
          <div style={{ ...card, marginTop: 16 }}>
            <h3 style={h3}>Insights ({range})</h3>
            {!insights ? (
              <div style={{ opacity: 0.55, fontSize: 13 }}>{busy === 'data' ? 'Loading insights…' : 'No insights for this range.'}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
                <Stat label="Spend" value={`${insights.spend?.toLocaleString(undefined, { style: 'currency', currency: cur })}`} />
                <Stat label="Impressions" value={fmt(insights.impressions)} />
                <Stat label="Clicks" value={fmt(insights.clicks)} />
                <Stat label="CTR" value={`${fmt(insights.ctr)}%`} />
                <Stat label="CPC" value={insights.cpc?.toLocaleString(undefined, { style: 'currency', currency: cur })} />
              </div>
            )}
          </div>

          {/* Campaigns */}
          <div style={{ ...card, marginTop: 16 }}>
            <h3 style={h3}>Campaigns ({campaigns.length})</h3>
            {campaigns.length === 0 ? (
              <div style={{ opacity: 0.55, fontSize: 13 }}>{busy === 'data' ? 'Loading…' : 'No campaigns in this ad account yet.'}</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {campaigns.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                      <div style={{ opacity: 0.6, fontSize: 12 }}>{c.objective}</div>
                    </div>
                    <span style={badge(c.effective_status || c.status)}>{c.effective_status || c.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create campaign — always PAUSED */}
          <div style={{ ...card, marginTop: 16 }}>
            <h3 style={h3}>Create campaign</h3>
            <p style={{ fontSize: 12, opacity: 0.65, margin: '0 0 10px' }}>
              New campaigns are created <b>PAUSED</b> — nothing goes live automatically. Activate in Meta Ads Manager when ready.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Campaign name" style={{ ...input, width: 240 }} />
              <select value={newObjective} onChange={(e) => setNewObjective(e.target.value)} style={{ ...input, width: 'auto' }}>
                {OBJECTIVES.map((o) => <option key={o} value={o}>{o.replace('OUTCOME_', '')}</option>)}
              </select>
              <button onClick={() => void createCampaign()} disabled={busy === 'create' || !newName.trim() || !selected} style={btn('#6366f1')}>
                {busy === 'create' ? 'Creating…' : 'Create (paused)'}
              </button>
            </div>
            {createMsg ? <div style={{ fontSize: 12, color: '#6ee7b7', marginTop: 8 }}>{createMsg}</div> : null}
          </div>

          {/* Disconnect handled on the Overview tab; keep this surface focused on ads. */}
        </>
      )}

      {permIssue && connected ? <div style={{ fontSize: 13, color: '#fcd34d', marginTop: 12 }}>{permIssue}</div> : null}
      {err ? <div style={{ fontSize: 13, color: '#fda4af', marginTop: 12 }}>{err}</div> : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}
