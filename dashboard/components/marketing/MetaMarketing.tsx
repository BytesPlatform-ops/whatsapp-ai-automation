'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Meta Marketing Agent dashboard.
 *
 * Everything routes through /api/test-proxy → FastAPI backend. Flow:
 *   1. Connect Meta (real OAuth popup) OR Use demo data (seeded, no Meta app).
 *   2. See assets + analytics summary.
 *   3. Analyze with Pixie → real OpenAI insights + recommendations.
 *   4. Prepare a post/reel → real OpenAI caption → approval card.
 *   5. Approve → publish (mock until Meta is really connected AND real mode).
 * No public action runs without approval.
 */

interface ProxyResult { ok: boolean; status: number; ms: number; data?: any; error?: string; }

async function callProxy(baseUrl: string, method: string, path: string, body?: unknown): Promise<ProxyResult> {
  const res = await fetch('/api/test-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: baseUrl || undefined, method, path, body }),
  });
  return (await res.json()) as ProxyResult;
}

const card: React.CSSProperties = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 };
const input: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px', color: 'white', width: '100%', fontSize: 14 };
const label: React.CSSProperties = { fontSize: 12, opacity: 0.6, marginBottom: 4, display: 'block' };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: '0 0 12px' };
const PRIORITY: Record<string, string> = { high: '#fda4af', medium: '#fcd34d', low: '#93c5fd' };
function btn(bg: string): React.CSSProperties {
  return { background: bg, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 14px', color: 'white', cursor: 'pointer', fontSize: 13 };
}

export function MetaMarketing() {
  const [baseUrl, setBaseUrl] = useState('');
  const [tenant, setTenant] = useState('demo_tenant');
  const [status, setStatus] = useState<any>(null);
  const [assets, setAssets] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [post, setPost] = useState({ platform: 'instagram', content_type: 'reel', idea: 'behind the scenes: how we make our signature latte', media_url: '' });

  const refresh = useCallback(async () => {
    const [st, a, ap, ev] = await Promise.all([
      callProxy(baseUrl, 'GET', `/api/meta/status?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/meta/assets?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/approvals?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/activity?tenant_id=${encodeURIComponent(tenant)}&limit=20`),
    ]);
    setStatus(st.data ?? { error: st.error });
    setAssets(a.data ?? null);
    setApprovals(Array.isArray(ap.data) ? ap.data.filter((x: any) => x.agent === 'marketing-agent') : []);
    setActivity(Array.isArray(ev.data) ? ev.data : []);
    if (a.data?.connected) {
      const s = await callProxy(baseUrl, 'GET', `/api/meta/analytics/summary?tenant_id=${encodeURIComponent(tenant)}`);
      setSummary(s.data ?? null);
    } else { setSummary(null); }
  }, [baseUrl, tenant]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const t = (e.data as any)?.type;
      if (t === 'meta-connected' || t === 'meta-connect-error') void refresh();
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [refresh]);

  function connectMeta() {
    const origin = (baseUrl || 'http://localhost:8000').replace(/\/+$/, '');
    window.open(`${origin}/api/meta/connect/start?tenant_id=${encodeURIComponent(tenant)}&feature=publishing`, 'pixie-meta', 'width=560,height=720');
  }
  async function useDemo() { setBusy('demo'); await callProxy(baseUrl, 'POST', '/api/meta/connect/demo', { tenant_id: tenant }); setBusy(''); await refresh(); }
  async function disconnect() { setBusy('disc'); await callProxy(baseUrl, 'POST', '/api/meta/disconnect', { tenant_id: tenant }); setBusy(''); setAnalysis(null); await refresh(); }

  async function analyze() {
    setBusy('analyze');
    const r = await callProxy(baseUrl, 'POST', '/api/agents/marketing/meta/analyze', { tenant_id: tenant });
    setAnalysis(r.ok ? r.data : { error: r.error });
    setBusy(''); await refresh();
  }
  async function preparePost() {
    setBusy('prepare');
    await callProxy(baseUrl, 'POST', '/api/agents/marketing/meta/prepare-post', { tenant_id: tenant, ...post });
    setBusy(''); await refresh();
  }
  async function resolve(id: string, action: 'approve' | 'skip') {
    setBusy(`${action}:${id}`);
    await callProxy(baseUrl, 'POST', `/api/approvals/${id}/${action}`, { tenant_id: tenant, now: new Date().toISOString() });
    setBusy(''); await refresh();
  }

  const connected = status?.connected;
  const live = status?.live;
  const prof = summary?.summary?.profile || {};
  const ads = summary?.summary?.ads_summary || {};

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, margin: 0 }}>Marketing Agent · Meta</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <label style={{ opacity: 0.6 }}>tenant</label>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ ...input, width: 130 }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default backend" style={{ ...input, width: 190 }} />
          <button onClick={() => void refresh()} style={btn('rgba(255,255,255,0.1)')}>Refresh</button>
        </div>
      </div>

      {/* Connection */}
      <div style={{ ...card, marginTop: 16, borderColor: connected ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ ...h3, margin: 0 }}>Connect Meta Business Suite</h3>
            <div style={{ fontSize: 13, opacity: 0.78, marginTop: 4 }}>
              {connected
                ? <>Connected <span style={{ color: live ? '#6ee7b7' : '#fcd34d' }}>({status.mode})</span> — {status.pages} page(s), {status.instagram} Instagram, {status.ad_accounts} ad account(s). {live ? 'Approved posts publish for real.' : 'Demo data — publishing is mocked.'}</>
                : status?.configured
                  ? 'Analyze your Facebook Page & Instagram, prepare content, publish only after approval.'
                  : 'No Meta app configured yet — use demo data to explore, or add META_APP_ID / META_APP_SECRET to go live.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {connected ? (
              <button onClick={() => void disconnect()} disabled={busy === 'disc'} style={btn('rgba(255,255,255,0.1)')}>Disconnect</button>
            ) : (
              <>
                <button onClick={connectMeta} disabled={status && !status.configured} style={{ ...btn('#1877f2'), fontWeight: 700, opacity: status && !status.configured ? 0.5 : 1 }}>Connect Meta</button>
                <button onClick={() => void useDemo()} disabled={busy === 'demo'} style={btn('rgba(255,255,255,0.1)')}>Use demo data</button>
              </>
            )}
          </div>
        </div>
        {status && !status.configured ? (
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 10, lineHeight: 1.5 }}>
            To go live: developers.facebook.com → create app → Facebook Login for Business → redirect URI <code style={{ color: '#93c5fd' }}>{status.redirect_uri}</code> → request MVP scopes → submit for App Review.
          </div>
        ) : null}
      </div>

      {connected ? (
        <>
          {/* Analytics + Analyze */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div style={card}>
              <h3 style={h3}>Analytics summary <span style={{ fontSize: 11, opacity: 0.6 }}>({summary?.source})</span></h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14 }}>
                <Stat k="Followers" v={prof.followers} />
                <Stat k="Reach" v={prof.reach} />
                <Stat k="Engagement" v={prof.engagement_rate_pct ? `${prof.engagement_rate_pct}%` : '—'} />
                <Stat k="Ad spend" v={ads.spend_usd ? `$${ads.spend_usd}` : '—'} />
                <Stat k="Ad CTR" v={ads.ctr_pct ? `${ads.ctr_pct}%` : '—'} />
                <Stat k="Ad leads" v={ads.leads} />
              </div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>Ads are read-only in this MVP.</div>
            </div>
            <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
              <h3 style={h3}>Analyze with Pixie</h3>
              <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 12px' }}>Pixie reads your Meta performance and writes marketing insights + recommendations using OpenAI.</p>
              <button onClick={() => void analyze()} disabled={busy === 'analyze'} style={{ ...btn('#6366f1'), fontWeight: 700, marginTop: 'auto', alignSelf: 'flex-start' }}>
                {busy === 'analyze' ? 'Analyzing…' : 'Analyze with Pixie'}
              </button>
            </div>
          </div>

          {/* Insights + recommendations */}
          {analysis?.analysis ? (
            <div style={{ ...card, marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ ...h3, margin: 0 }}>Pixie's analysis</h3>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(99,102,241,0.2)', color: '#c7d2fe' }}>
                  {analysis.llm_provider === 'openai' ? 'OpenAI' : 'mock'} · {analysis.model} · {analysis.data_source} data
                </span>
              </div>
              <p style={{ fontSize: 14, opacity: 0.85 }}>{analysis.analysis.summary}</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {(analysis.analysis.performance_insights || []).map((ins: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5 }}>
                    <span style={{ color: PRIORITY[ins.priority] || 'white', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, minWidth: 52 }}>{ins.priority}</span>
                    <span><b>{ins.title}</b> — {ins.meaning} <span style={{ opacity: 0.6 }}>({ins.evidence})</span></span>
                  </div>
                ))}
              </div>
              {(analysis.analysis.recommendations || []).length ? (
                <div style={{ marginTop: 12 }}>
                  <div style={label}>Recommendations</div>
                  {analysis.analysis.recommendations.map((r: any, i: number) => (
                    <div key={i} style={{ fontSize: 13.5, opacity: 0.9, padding: '3px 0' }}>• <b>{r.type}</b> — {r.title}: {r.summary}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Prepare a post */}
          <div style={{ ...card, marginTop: 16 }}>
            <h3 style={h3}>Prepare a post / reel</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={label}>Platform</label>
                <select value={post.platform} onChange={(e) => setPost({ ...post, platform: e.target.value })} style={input as any}>
                  <option value="instagram">Instagram</option><option value="facebook">Facebook</option>
                </select></div>
              <div><label style={label}>Content type</label>
                <select value={post.content_type} onChange={(e) => setPost({ ...post, content_type: e.target.value })} style={input as any}>
                  <option value="reel">Reel</option><option value="post">Post</option><option value="photo">Photo</option><option value="video">Video</option>
                </select></div>
            </div>
            <div style={{ marginTop: 12 }}><label style={label}>Idea / topic</label><input style={input} value={post.idea} onChange={(e) => setPost({ ...post, idea: e.target.value })} /></div>
            <div style={{ marginTop: 12 }}><label style={label}>Media URL (public — required for a real Instagram publish)</label><input style={input} value={post.media_url} onChange={(e) => setPost({ ...post, media_url: e.target.value })} placeholder="https://…" /></div>
            <button onClick={() => void preparePost()} disabled={busy === 'prepare'} style={{ ...btn('#6366f1'), marginTop: 14, fontWeight: 700 }}>
              {busy === 'prepare' ? 'Writing caption…' : 'Prepare with Pixie'}
            </button>
          </div>

          {/* Approvals */}
          <div style={{ ...card, marginTop: 16 }}>
            <h3 style={h3}>Pending approvals</h3>
            {approvals.length === 0 ? <div style={{ opacity: 0.5, fontSize: 13 }}>Nothing waiting. Prepare a post above.</div> : null}
            {approvals.map((ap) => (
              <div key={ap.id} style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: 14 }}>{ap.title}</b>
                  <span style={{ fontSize: 12, color: ap.status === 'executed' ? '#6ee7b7' : ap.status === 'skipped' ? 'rgba(255,255,255,0.5)' : '#fcd34d' }}>{ap.status}</span>
                </div>
                <div style={{ fontSize: 13.5, opacity: 0.85, marginTop: 6, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,0.04)', borderLeft: '3px solid rgba(99,102,241,0.6)', borderRadius: 8, padding: '10px 12px' }}>{ap.prepared_output?.caption || ap.preview}</div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>→ {ap.prepared_output?.will_publish_to} · {ap.tool} · risk {ap.risk_level}</div>
                {ap.execution_result ? (
                  <div style={{ fontSize: 13, marginTop: 6, color: ap.execution_result.executed ? '#fda4af' : '#6ee7b7' }}>{ap.execution_result.detail}</div>
                ) : ap.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => void resolve(ap.id, 'approve')} disabled={busy === `approve:${ap.id}`} style={{ ...btn('#10b981'), fontWeight: 700 }}>Approve &amp; publish</button>
                    <button onClick={() => void resolve(ap.id, 'skip')} style={btn('rgba(255,255,255,0.1)')}>Skip</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Activity */}
      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>Activity log</h3>
        {activity.length === 0 ? <div style={{ opacity: 0.5, fontSize: 13 }}>No activity yet.</div> : null}
        {activity.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '3px 0', opacity: 0.9 }}>
            <span style={{ color: '#93c5fd', minWidth: 170 }}>{e.type}</span><span>{e.title}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

function Stat({ k, v }: { k: string; v: any }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 12px' }}>
      <div style={{ fontSize: 11, opacity: 0.55 }}>{k}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v ?? '—'}</div>
    </div>
  );
}
