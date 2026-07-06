'use client';

import { useCallback, useEffect, useState } from 'react';
import { SeoNav } from './SeoNav';
import { callProxy } from '../marketing/metaClient';

const panel: React.CSSProperties = {
  background: 'linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 22,
  boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -40px rgba(0,0,0,0.7)',
};
const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 12px', color: 'white', fontSize: 13 };
function btn(bg: string): React.CSSProperties {
  return { background: bg, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '9px 15px', color: 'white', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 };
}
const ICON: Record<string, string> = { wordpress: '🟦', shopify: '🛍️', webflow: '🌊', wix: '⬛', squarespace: '⬜', custom: '💻', unknown: '🌐' };

function scoreColor(s: number) { return s >= 80 ? '#6ee7b7' : s >= 50 ? '#fcd34d' : '#f87171'; }

export function SeoHistory() {
  const [tenant, setTenant] = useState('demo_tenant');
  const [baseUrl, setBaseUrl] = useState('');
  const [audits, setAudits] = useState<any[]>([]);

  const refresh = useCallback(async () => {
    const r = await callProxy(baseUrl, 'GET', `/api/agents/seo/history?tenant_id=${encodeURIComponent(tenant)}`);
    setAudits(r.data?.audits ?? []);
  }, [baseUrl, tenant]);
  useEffect(() => { void refresh(); }, [refresh]);

  const avg = audits.length ? Math.round(audits.reduce((a, x) => a + (x.score || 0), 0) / audits.length) : 0;

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '34px 22px 80px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Audit History</h1>
          <p style={{ margin: '6px 0 0', opacity: 0.6, fontSize: 14.5 }}>Every audit Pixie has run, with score and detected platform.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ ...inp, width: 110 }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default" style={{ ...inp, width: 150 }} />
          <button onClick={() => void refresh()} style={btn('rgba(255,255,255,0.06)')}>Refresh</button>
        </div>
      </div>
      <SeoNav />

      {/* summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 18 }}>
        {[['Audits run', audits.length], ['Avg. score', avg || '—'], ['Websites', new Set(audits.map((a) => a.website_url)).size]].map(([k, v]: any) => (
          <div key={k} style={{ ...panel, padding: 16 }}>
            <div style={{ fontSize: 12, opacity: 0.55 }}>{k}</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-display)', color: k === 'Avg. score' && typeof v === 'number' ? scoreColor(v) : 'white' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ ...panel, marginTop: 16, padding: 8 }}>
        {audits.length === 0 ? <div style={{ opacity: 0.5, fontSize: 13, padding: 16 }}>No audits yet. Run one on the Audit tab.</div> : null}
        {audits.map((a) => (
          <a key={a.id} href={`/agents/seo/audit?auto=${encodeURIComponent(a.website_url)}`}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 14px', borderRadius: 14, textDecoration: 'none', color: 'white' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
              <span style={{ fontSize: 20 }}>{ICON[a.platform] || '🌐'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.website_url}</div>
                <div style={{ fontSize: 12, opacity: 0.55, textTransform: 'capitalize' }}>{a.platform} · {a.issue_count} issues · {String(a.created_at || '').slice(0, 16).replace('T', ' ')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 5 }}>
                <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: 'rgba(16,185,129,0.14)', color: '#6ee7b7' }}>{a.counts?.auto_fix ?? 0} one-tap</span>
                <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: 'rgba(59,130,246,0.14)', color: '#93c5fd' }}>{a.counts?.copy_ready ?? 0} copy</span>
              </div>
              <div style={{ width: 46, height: 46, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `3px solid ${scoreColor(a.score)}`, fontSize: 15, fontWeight: 800 }}>{a.score}</div>
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
