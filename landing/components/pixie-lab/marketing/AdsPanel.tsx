'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle, Plug, Plus } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaAdAccount, MetaCampaign, MetaAdInsights } from '@/lib/pixie-lab/serviceTypes';
import { AdsAssistant } from './AdsAssistant';

const ACCENT = '#EC4899';

const OBJECTIVES = [
  'OUTCOME_TRAFFIC', 'OUTCOME_LEADS', 'OUTCOME_ENGAGEMENT',
  'OUTCOME_AWARENESS', 'OUTCOME_SALES', 'OUTCOME_APP_PROMOTION',
];

const RANGES = [
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'maximum', label: 'Maximum' },
];

function statusColor(s: string): string {
  if (s === 'ACTIVE') return '#22c55e';
  if (s?.includes('PAUSED')) return '#f59e0b';
  if (s === 'DELETED' || s === 'WITH_ISSUES') return '#ef4444';
  return '#94a3b8';
}

/**
 * AdsPanel — Meta Ads Marketing API surface inside the Pixie Lab Marketing
 * workspace (shown only when Meta is connected). Ad-account selector, insights
 * cards, campaigns table, and a PAUSED-only campaign creator. All data flows
 * through the /api/lab/meta/* proxies (tenant server-resolved; the access token
 * never reaches the browser). Structured backend errors drive the reconnect /
 * missing-permission / empty states — numbers are never faked.
 *
 * `onConnectionChange` lets the parent workspace re-fetch Meta status after a
 * disconnect (so the panel hides) or reconnect.
 */
export function AdsPanel({ onConnectionChange, draftId }: { onConnectionChange?: () => void; draftId?: string }) {
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const [selected, setSelected] = useState('');
  const [range, setRange] = useState('last_30d');
  const [source, setSource] = useState('');

  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [insights, setInsights] = useState<MetaAdInsights | null>(null);

  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [err, setErr] = useState('');
  const [permIssue, setPermIssue] = useState('');
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const [newName, setNewName] = useState('');
  const [newObjective, setNewObjective] = useState('OUTCOME_TRAFFIC');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  const [draftBanner, setDraftBanner] = useState('');

  // Translate any endpoint's structured error into shared banners. Returns true
  // if the response carried an error (so callers can stop).
  const absorb = useCallback((d: any): boolean => {
    if (!d) { setErr('Backend unreachable.'); return true; }
    if (d.backendUp === false) { setErr(d.error || 'The marketing service is offline.'); return true; }
    if (d.error) {
      if (d.needs_reconnect) setNeedsReconnect(true);
      if (d.error === 'missing_permission') setPermIssue(d.message || 'Meta permission missing.');
      else if (d.error !== 'not_connected' && d.error !== 'no_ad_account') setErr(d.message || d.error);
      return true;
    }
    return false;
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true); setErr(''); setPermIssue(''); setNeedsReconnect(false);
    const d = await metaApi.adAccounts();
    setLoadingAccounts(false);
    setSource(d.source || '');
    if (absorb(d)) { setAccounts([]); return; }
    const list = d.ad_accounts || [];
    setAccounts(list);
    setSelected((prev) => prev || list[0]?.id || '');
  }, [absorb]);

  const loadData = useCallback(async (adAccountId: string) => {
    if (!adAccountId) { setCampaigns([]); setInsights(null); return; }
    setLoadingData(true); setErr(''); setPermIssue('');
    const [c, ins] = await Promise.all([metaApi.campaigns(adAccountId), metaApi.insights(adAccountId, range)]);
    if (!absorb(c)) setCampaigns(c.campaigns || []);
    if (!absorb(ins)) setInsights(ins.insights || null);
    setLoadingData(false);
  }, [range, absorb]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);
  useEffect(() => { if (selected) void loadData(selected); }, [selected, loadData]);

  // Deep-linked from a Command Center recommendation: pre-fill the PAUSED-only
  // campaign form with Pixie's draft. Nothing is created until the user clicks
  // Create (paused) — this only fills the form.
  useEffect(() => {
    if (!draftId) return;
    void metaApi.marketingRecommendations().then((d) => {
      const draft = (d.recommendations || []).find((r) => r.id === draftId)?.draft;
      if (!draft) return;
      if (draft.campaign_name) setNewName(draft.campaign_name);
      if (draft.objective && OBJECTIVES.includes(draft.objective)) setNewObjective(draft.objective);
      setDraftBanner(`Reviewing Pixie's draft “${draft.campaign_name || 'campaign'}”. It will be created PAUSED — nothing goes live automatically.`);
    });
  }, [draftId]);

  async function chooseAccount(id: string) {
    setSelected(id);
    await metaApi.selectAdAccount(id);
  }

  function reconnect() {
    const popup = window.open(metaApi.connectUrl('ads'), 'meta_oauth', 'width=600,height=720');
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        onConnectionChange?.();
        void loadAccounts();
      }
    }, 800);
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await metaApi.disconnect();
      onConnectionChange?.();
    } finally {
      setDisconnecting(false);
    }
  }

  async function createCampaign() {
    if (!newName.trim() || !selected) return;
    setCreating(true); setCreateMsg(''); setErr('');
    const d = await metaApi.createCampaign({ ad_account_id: selected, name: newName.trim(), objective: newObjective });
    setCreating(false);
    if (d.ok) {
      setCreateMsg(d.note || 'Campaign created (PAUSED).');
      setNewName('');
      void loadData(selected);
    } else {
      absorb(d);
    }
  }

  const cur = accounts.find((a) => a.id === selected)?.currency || 'USD';
  const money = (n?: number) => (n ?? 0).toLocaleString(undefined, { style: 'currency', currency: cur });
  const num = (n?: number) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const box = 'rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5';

  return (
    <div className="mt-6 space-y-5">
      {/* Reconnect / permission banners */}
      {needsReconnect && (
        <div className={box} style={{ borderColor: '#f59e0b' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 flex-none" style={{ color: '#f59e0b' }} />
            <div className="flex-1">
              <p className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Reconnect Meta</p>
              <p className="mt-1 text-[13px] text-[var(--pl-text-muted)]">Your Meta token expired or was revoked. Reconnect to restore ads access.</p>
            </div>
            <button onClick={reconnect} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: ACCENT }}>
              <RefreshCw size={14} /> Reconnect
            </button>
          </div>
        </div>
      )}
      {permIssue && (
        <div className={box} style={{ borderColor: '#f59e0b' }}>
          <p className="text-[13px] text-[var(--pl-text-muted)]"><AlertTriangle size={14} className="mr-1 inline" style={{ color: '#f59e0b' }} />{permIssue} <span className="opacity-70">(ads_read / ads_management / business_management may need Meta App Review.)</span></p>
        </div>
      )}

      {/* Ad account selector + range + connection controls */}
      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Ad account</h3>
          <div className="flex items-center gap-2">
            {source === 'demo' && <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: 'color-mix(in srgb,#f59e0b 16%,transparent)', color: '#f59e0b' }}>Demo data</span>}
            <button onClick={reconnect} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"><Plug size={12} /> Reconnect</button>
            <button onClick={disconnect} disabled={disconnecting} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50">{disconnecting ? <Loader2 size={12} className="animate-spin" /> : null} Disconnect</button>
          </div>
        </div>

        {loadingAccounts ? (
          <div className="mt-4 flex items-center gap-2 text-[13px] text-[var(--pl-text-muted)]"><Loader2 size={14} className="animate-spin" /> Loading ad accounts…</div>
        ) : accounts.length === 0 ? (
          <p className="mt-4 text-[13px] text-[var(--pl-text-muted)]">{permIssue ? 'Permission needed to list ad accounts.' : 'No ad accounts found.'}</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <select value={selected} onChange={(e) => void chooseAccount(e.target.value)} className="min-w-[260px] rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)]">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {a.id}{a.currency ? ` · ${a.currency}` : ''}{a.account_status_label ? ` · ${a.account_status_label}` : ''}</option>
              ))}
            </select>
            <select value={range} onChange={(e) => setRange(e.target.value)} className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)]">
              {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {loadingData && <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--pl-text-muted)]"><Loader2 size={12} className="animate-spin" /> Loading…</span>}
          </div>
        )}
      </div>

      {/* Insights cards */}
      {accounts.length > 0 && (
        <div className={box}>
          <h3 className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Insights <span className="text-[12px] font-normal text-[var(--pl-text-muted)]">({RANGES.find((r) => r.value === range)?.label})</span></h3>
          {!insights ? (
            <p className="mt-3 text-[13px] text-[var(--pl-text-muted)]">{loadingData ? 'Loading insights…' : 'No delivery in this range.'}</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Spend" value={money(insights.spend)} />
              <Stat label="Impressions" value={num(insights.impressions)} />
              <Stat label="Clicks" value={num(insights.clicks)} />
              <Stat label="CTR" value={`${num(insights.ctr)}%`} />
              <Stat label="CPC" value={money(insights.cpc)} />
            </div>
          )}
        </div>
      )}

      {/* Campaigns table */}
      {accounts.length > 0 && (
        <div className={box}>
          <h3 className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Campaigns <span className="text-[12px] font-normal text-[var(--pl-text-muted)]">({campaigns.length})</span></h3>
          {campaigns.length === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--pl-text-muted)]">{loadingData ? 'Loading…' : 'No campaigns found for this ad account.'}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-[var(--pl-text-muted)]">
                    <th className="pb-2 pr-3 font-semibold">Campaign</th>
                    <th className="pb-2 pr-3 font-semibold">Objective</th>
                    <th className="pb-2 pr-3 font-semibold">Status</th>
                    <th className="pb-2 font-semibold">Effective</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-t border-[var(--pl-border)]">
                      <td className="py-2 pr-3 font-medium text-[var(--pl-text)]">{c.name}</td>
                      <td className="py-2 pr-3 text-[var(--pl-text-muted)]">{c.objective?.replace('OUTCOME_', '') || '—'}</td>
                      <td className="py-2 pr-3">
                        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: `color-mix(in srgb, ${statusColor(c.status)} 16%, transparent)`, color: statusColor(c.status) }}>{c.status}</span>
                      </td>
                      <td className="py-2">
                        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: `color-mix(in srgb, ${statusColor(c.effective_status)} 16%, transparent)`, color: statusColor(c.effective_status) }}>{c.effective_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Ads assistant — read-only intelligence (creates nothing) */}
      {accounts.length > 0 && selected && (
        <AdsAssistant adAccountId={selected} range={range} />
      )}

      {/* Create campaign (always PAUSED) */}
      {accounts.length > 0 && (
        <div className={box}>
          <h3 className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">Create campaign</h3>
          <p className="mt-1 text-[12px] text-[var(--pl-text-muted)]">New campaigns are created <b>PAUSED</b> — nothing goes live automatically. Activate in Meta Ads Manager when ready.</p>
          {draftBanner && (
            <div className="mt-2 rounded-lg border p-2.5 text-[12px] text-[var(--pl-text-soft)]" style={{ borderColor: ACCENT, background: `${ACCENT}0d` }}>{draftBanner}</div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Campaign name" className="w-[240px] rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)]" />
            <select value={newObjective} onChange={(e) => setNewObjective(e.target.value)} className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)]">
              {OBJECTIVES.map((o) => <option key={o} value={o}>{o.replace('OUTCOME_', '')}</option>)}
            </select>
            <button onClick={() => void createCampaign()} disabled={creating || !newName.trim() || !selected} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: ACCENT }}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create (paused)
            </button>
          </div>
          {createMsg && <p className="mt-2 text-[12px]" style={{ color: '#22c55e' }}>{createMsg}</p>}
        </div>
      )}

      {err && <p className="text-[13px]" style={{ color: '#ef4444' }}>{err}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">{label}</div>
      <div className="mt-1 font-display text-[20px] font-extrabold text-[var(--pl-text)]">{value}</div>
    </div>
  );
}
