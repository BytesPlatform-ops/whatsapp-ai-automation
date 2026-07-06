'use client';

import { useCallback, useEffect, useState } from 'react';
import { SeoNav } from './SeoNav';
import { callProxy } from '../marketing/metaClient';

const RISK: Record<string, { bg: string; fg: string }> = {
  low: { bg: 'rgba(16,185,129,0.15)', fg: '#6ee7b7' },
  medium: { bg: 'rgba(245,158,11,0.15)', fg: '#fcd34d' },
  high: { bg: 'rgba(248,113,113,0.15)', fg: '#fda4af' },
};
const panel: React.CSSProperties = {
  background: 'linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 20,
  boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -40px rgba(0,0,0,0.7)',
};
const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 12px', color: 'white', fontSize: 13, width: '100%' };
function btn(bg: string, fg = 'white'): React.CSSProperties {
  return { background: bg, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '9px 15px', color: fg, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 };
}
const ICON: Record<string, string> = { wordpress: '🟦', shopify: '🛍️', webflow: '🌊', wix: '⬛', squarespace: '⬜', custom: '💻' };

export function SeoConnections() {
  const [tenant, setTenant] = useState('demo_tenant');
  const [baseUrl, setBaseUrl] = useState('');
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [wp, setWp] = useState({ site_url: '', username: '', application_password: '' });
  const [tok, setTok] = useState<Record<string, string>>({});
  const [gh, setGh] = useState({ repo: '', token: '' });
  const [manualOpen, setManualOpen] = useState(false);
  const [msg, setMsg] = useState<Record<string, any>>({});

  async function connectGithub(platform: string) {
    setBusy(platform);
    const r = await callProxy(baseUrl, 'POST', '/api/agents/seo/connections/token/connect', { tenant_id: tenant, platform, token: gh.token, site_id: gh.repo });
    setMsg((p) => ({ ...p, [platform]: r.data })); setBusy(''); await refresh();
  }

  const refresh = useCallback(async () => {
    const r = await callProxy(baseUrl, 'GET', `/api/agents/seo/connections/status?tenant_id=${encodeURIComponent(tenant)}`);
    setPlatforms(r.data?.platforms ?? []);
  }, [baseUrl, tenant]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function connectWp() {
    setBusy('wp');
    const r = await callProxy(baseUrl, 'POST', '/api/agents/seo/connections/wordpress/connect', { tenant_id: tenant, ...wp });
    setMsg((p) => ({ ...p, wordpress: r.data })); setBusy(''); await refresh();
  }
  async function connectToken(platform: string) {
    setBusy(platform);
    const r = await callProxy(baseUrl, 'POST', '/api/agents/seo/connections/token/connect', { tenant_id: tenant, platform, token: tok[platform] || '' });
    setMsg((p) => ({ ...p, [platform]: r.data })); setBusy(''); await refresh();
  }
  async function disconnect(platform: string) {
    setBusy(`d:${platform}`);
    await callProxy(baseUrl, 'POST', '/api/agents/seo/connections/disconnect', { tenant_id: tenant, platform });
    setBusy(''); await refresh();
  }

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '34px 22px 80px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Website Connections</h1>
          <p style={{ margin: '6px 0 0', opacity: 0.6, fontSize: 14.5 }}>Connect your website platform to let Pixie apply approved SEO fixes with one tap.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ ...inp, width: 110 }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default" style={{ ...inp, width: 150 }} />
          <button onClick={() => void refresh()} style={btn('rgba(255,255,255,0.06)')}>Refresh</button>
        </div>
      </div>
      <SeoNav />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16, marginTop: 18 }}>
        {platforms.map((p) => {
          const risk = RISK[p.risk] || RISK.medium;
          return (
            <div key={p.platform} style={{ ...panel, borderColor: p.connected ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 22 }}>{ICON[p.platform] || '🌐'}</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{p.support}</div>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: p.connected ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.14)', color: p.connected ? '#6ee7b7' : '#cbd5e1' }}>
                  {p.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>

              <div style={{ fontSize: 12.5, margin: '12px 0 6px', opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Can optimize</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {p.can_optimize.map((x: string) => (
                  <span key={x} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 8, background: 'rgba(139,124,246,0.12)', color: '#c4b5fd' }}>✓ {x}</span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, fontSize: 12, opacity: 0.75 }}>
                <span>Requires: {p.required}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: risk.bg, color: risk.fg }}>{p.risk} risk</span>
              </div>

              {p.connected ? (
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: '#6ee7b7' }}>✓ {p.connected_as}</span>
                  <button onClick={() => void disconnect(p.platform)} disabled={busy === `d:${p.platform}`} style={btn('rgba(255,255,255,0.06)')}>Disconnect</button>
                </div>
              ) : p.platform === 'wordpress' ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 7 }}>
                  <input placeholder="https://yoursite.com" value={wp.site_url} onChange={(e) => setWp({ ...wp, site_url: e.target.value })} style={inp} />
                  <input placeholder="admin username or email" value={wp.username} onChange={(e) => setWp({ ...wp, username: e.target.value })} style={inp} />
                  <input type="password" placeholder="application password" value={wp.application_password} onChange={(e) => setWp({ ...wp, application_password: e.target.value })} style={inp} />
                  <div style={{ fontSize: 10.5, opacity: 0.5, lineHeight: 1.5 }}>Create it in WP Admin → Users → Profile → Application Passwords. Pixie stores it server-side only — never in your browser.</div>
                  <button onClick={() => void connectWp()} disabled={busy === 'wp'} style={btn('linear-gradient(90deg,#8b7cf6,#6d5cf0)')}>{busy === 'wp' ? 'Testing…' : 'Connect WordPress'}</button>
                </div>
              ) : p.connect === 'token' ? (
                <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                  <input type="password" placeholder="API token" value={tok[p.platform] || ''} onChange={(e) => setTok((s) => ({ ...s, [p.platform]: e.target.value }))} style={inp} />
                  <button onClick={() => void connectToken(p.platform)} disabled={busy === p.platform} style={btn('rgba(139,124,246,0.2)', '#c4b5fd')}>Connect</button>
                </div>
              ) : p.connect === 'github' ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 7 }}>
                  <input placeholder="github.com/you/your-repo" value={gh.repo} onChange={(e) => setGh({ ...gh, repo: e.target.value })} style={inp} />
                  <input type="password" placeholder="GitHub access token (repo scope)" value={gh.token} onChange={(e) => setGh({ ...gh, token: e.target.value })} style={inp} />
                  <div style={{ fontSize: 10.5, opacity: 0.5, lineHeight: 1.5 }}>Pixie stores this server-side and opens a pull request for approved SEO fixes — it never pushes to production directly.</div>
                  <button onClick={() => void connectGithub(p.platform)} disabled={busy === p.platform} style={btn('linear-gradient(90deg,#8b7cf6,#6d5cf0)')}>{busy === p.platform ? 'Connecting…' : 'Connect GitHub'}</button>
                </div>
              ) : (
                <div style={{ marginTop: 12, display: 'grid', gap: 7 }}>
                  <input type="password" placeholder="Squarespace API key (commerce, optional)" value={tok[p.platform] || ''} onChange={(e) => setTok((s) => ({ ...s, [p.platform]: e.target.value }))} style={inp} />
                  <div style={{ fontSize: 10.5, opacity: 0.5, lineHeight: 1.5 }}>Page SEO on Squarespace stays copy-ready / manual (no public page-SEO API). A key only enables limited commerce SEO where the API allows.</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => void connectToken(p.platform)} disabled={busy === p.platform} style={btn('rgba(139,124,246,0.2)', '#c4b5fd')}>Save key</button>
                    <button onClick={() => setManualOpen((v) => !v)} style={btn('rgba(255,255,255,0.06)')}>{manualOpen ? 'Hide' : 'Manual steps'}</button>
                  </div>
                  {manualOpen ? (
                    <ol style={{ fontSize: 11.5, opacity: 0.7, lineHeight: 1.6, margin: '4px 0 0', paddingLeft: 18 }}>
                      <li>Run an audit — Pixie generates copy-ready titles/descriptions.</li>
                      <li>In Squarespace: Pages → ⚙ Settings → SEO.</li>
                      <li>Paste each copied fix into the SEO title / description fields.</li>
                    </ol>
                  ) : null}
                </div>
              )}
              {msg[p.platform] ? <div style={{ fontSize: 12, marginTop: 8, color: msg[p.platform].status === 'connected' ? '#6ee7b7' : '#fda4af' }}>{msg[p.platform].message || msg[p.platform].status}</div> : null}
            </div>
          );
        })}
      </div>
    </main>
  );
}
