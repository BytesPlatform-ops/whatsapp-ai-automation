'use client';

import { useEffect, useRef, useState } from 'react';
import { SeoNav } from './SeoNav';
import { callProxy } from '../marketing/metaClient';

const ACCENT = '#8b7cf6';
const FIXMODE: Record<string, { label: string; bg: string; fg: string }> = {
  auto_fix: { label: 'One-tap', bg: 'rgba(16,185,129,0.15)', fg: '#6ee7b7' },
  approval_required: { label: 'Approval', bg: 'rgba(139,124,246,0.18)', fg: '#c4b5fd' },
  copy_ready: { label: 'Copy-ready', bg: 'rgba(59,130,246,0.15)', fg: '#93c5fd' },
  manual_only: { label: 'Manual', bg: 'rgba(245,158,11,0.15)', fg: '#fcd34d' },
  unsupported: { label: 'Unsupported', bg: 'rgba(148,163,184,0.15)', fg: '#cbd5e1' },
};
const SEV: Record<string, string> = { critical: '#f87171', high: '#fda4af', medium: '#fcd34d', low: '#93c5fd', info: '#94a3b8' };
const TABS = ['Overview', 'Issues', 'Quick Wins', 'Manual', 'Connection'] as const;

const panel: React.CSSProperties = {
  background: 'linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 22,
  boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -40px rgba(0,0,0,0.7)',
};
const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '11px 14px', color: 'white', fontSize: 14 };
function btn(bg: string, fg = 'white'): React.CSSProperties {
  return { background: bg, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 11, padding: '9px 16px', color: fg, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
}
function Badge({ children, bg, fg }: any) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: bg, color: fg, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Ring({ score }: { score: number }) {
  const r = 52, c = 2 * Math.PI * r, col = score >= 80 ? '#6ee7b7' : score >= 50 ? '#fcd34d' : '#f87171';
  return (
    <svg width="132" height="132" viewBox="0 0 132 132">
      <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
      <circle cx="66" cy="66" r={r} fill="none" stroke={col} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 66 66)" />
      <text x="66" y="62" textAnchor="middle" fontSize="34" fontWeight="800" fill="white">{score}</text>
      <text x="66" y="84" textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.5)">/ 100</text>
    </svg>
  );
}

export function SeoAudit() {
  const [tenant, setTenant] = useState('demo_tenant');
  const [baseUrl, setBaseUrl] = useState('');
  const [url, setUrl] = useState('https://wordpress.org');
  const [crawl, setCrawl] = useState('5');
  const [perf, setPerf] = useState(false);
  const [busy, setBusy] = useState('');
  const [audit, setAudit] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [platform, setPlatform] = useState<any>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const [drawer, setDrawer] = useState<any>(null); // {issue, prep}
  const [toast, setToast] = useState('');

  function flash(m: string) { setToast(m); setTimeout(() => setToast(''), 2600); }

  // ?auto=<url> auto-runs an audit on load (used for screenshot capture / deep links).
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    const q = new URLSearchParams(window.location.search).get('auto');
    if (q) { ran.current = true; setUrl(q); setTimeout(() => void runAudit(), 50); }
  }, []); // eslint-disable-line

  async function runAudit() {
    setBusy('audit'); setAudit(null); setIssues([]);
    const r = await callProxy(baseUrl, 'POST', '/api/agents/seo/audit/start', { tenant_id: tenant, website_url: url, crawl_limit: Number(crawl), include_pagespeed: perf });
    setBusy('');
    if (r.data?.status !== 'complete') { setAudit({ error: r.data?.reason || r.data?.status || 'audit failed' }); return; }
    setAudit(r.data.audit); setIssues(r.data.issues); setPlatform(r.data.platform); setTab('Overview');
  }
  async function openOptimize(iss: any) {
    setBusy(`opt:${iss.id}`);
    const r = await callProxy(baseUrl, 'POST', '/api/agents/seo/optimize/prepare', { tenant_id: tenant, audit_id: audit.id, issue_id: iss.id });
    setBusy(''); setDrawer({ issue: iss, prep: r.data });
  }
  async function approve(approvalId: string) {
    setBusy('approve');
    const r = await callProxy(baseUrl, 'POST', `/api/approvals/${approvalId}/approve`, { tenant_id: tenant, now: new Date().toISOString() });
    setBusy('');
    const er = r.data?.execution_result;
    flash(er?.executed ? 'WordPress updated successfully.' : (er?.detail || 'Mock optimization completed. No live website was changed.'));
    setDrawer((d: any) => ({ ...d, applied: er }));
    const gi = await callProxy(baseUrl, 'GET', `/api/agents/seo/audit/${audit.id}/issues?tenant_id=${encodeURIComponent(tenant)}`);
    if (Array.isArray(gi.data?.issues)) setIssues(gi.data.issues);
  }
  function copyFix(text: string) { navigator.clipboard?.writeText(text); flash('Fix copied to clipboard.'); }

  const cats = audit?.category_scores || {};
  const quickWins = issues.filter((i) => i.auto_fix_available || (i.fix_mode === 'copy_ready' && i.difficulty !== 'hard')).slice(0, 5);
  const filtered = issues.filter((i) => tab === 'Issues' ? true
    : tab === 'Quick Wins' ? (i.auto_fix_available || (i.fix_mode === 'copy_ready' && i.difficulty !== 'hard'))
    : tab === 'Manual' ? (i.fix_mode === 'manual_only' || i.fix_mode === 'unsupported') : false);

  const IssueCard = (iss: any) => {
    const fm = FIXMODE[iss.fix_mode] || FIXMODE.manual_only;
    return (
      <div key={iss.id} style={{ padding: '14px 0', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ fontSize: 14.5, fontWeight: 650 }}>
            <span style={{ color: SEV[iss.severity], marginRight: 6 }}>●</span>{iss.issue}
            {iss.status === 'done' ? <span style={{ color: '#6ee7b7', fontSize: 12, marginLeft: 8 }}>✓ Done</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Badge bg="rgba(255,255,255,0.06)" fg="rgba(255,255,255,0.7)">{iss.impact} impact</Badge>
            <Badge bg={fm.bg} fg={fm.fg}>{fm.label}</Badge>
          </div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.75, margin: '6px 0 2px' }}>{iss.one_liner}</div>
        <div style={{ fontSize: 13, color: '#c4b5fd' }}><b style={{ color: 'white' }}>Fix:</b> {iss.fix_one_liner}</div>
        <div style={{ fontSize: 11.5, opacity: 0.5, marginTop: 4 }}>{iss.page_url} · {iss.category} · {iss.platform} · {iss.difficulty}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {iss.status === 'done' ? <Badge bg="rgba(16,185,129,0.15)" fg="#6ee7b7">Optimized</Badge>
            : iss.auto_fix_available ? <button onClick={() => void openOptimize(iss)} disabled={busy === `opt:${iss.id}`} style={btn('linear-gradient(90deg,#8b7cf6,#6d5cf0)')}>Optimize</button>
            : null}
          <button onClick={() => copyFix(iss.fix_one_liner)} style={btn('rgba(255,255,255,0.06)')}>Copy Fix</button>
        </div>
      </div>
    );
  };

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '34px 22px 80px', fontFamily: 'var(--font-sans)' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Website SEO Audit</h1>
          <p style={{ margin: '6px 0 0', opacity: 0.6, fontSize: 14.5 }}>Scan your website, find SEO issues, and approve safe fixes.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ ...inp, width: 110, padding: '7px 10px' }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default" style={{ ...inp, width: 150, padding: '7px 10px' }} />
        </div>
      </div>
      <SeoNav />

      {/* input card */}
      <div style={{ ...panel, marginTop: 18 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Run a Website SEO Audit</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" style={{ ...inp, flex: 1, minWidth: 260 }} />
          <select value={crawl} onChange={(e) => setCrawl(e.target.value)} style={{ ...inp } as any}>
            {['5', '10', '25', '50'].map((n) => <option key={n} value={n}>Crawl {n}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: 0.75 }}>
            <input type="checkbox" checked={perf} onChange={(e) => setPerf(e.target.checked)} /> Performance
          </label>
          <button onClick={() => void runAudit()} disabled={busy === 'audit' || !url.trim()} style={{ ...btn('linear-gradient(90deg,#8b7cf6,#6d5cf0)'), padding: '11px 22px', opacity: busy === 'audit' ? 0.7 : 1 }}>
            {busy === 'audit' ? 'Crawling…' : 'Run Audit'}
          </button>
        </div>
        {busy === 'audit' ? <div style={{ fontSize: 13, opacity: 0.6, marginTop: 12 }}>🔎 Pixie is crawling your website — checking pages, metadata, headings, images, schema, and links…</div> : null}
        {!audit && busy !== 'audit' ? <div style={{ fontSize: 13.5, opacity: 0.5, marginTop: 12 }}>Enter your website URL and Pixie will scan it for SEO issues.</div> : null}
      </div>

      {audit?.error ? <div style={{ ...panel, marginTop: 16, borderColor: 'rgba(248,113,113,0.4)' }}>Pixie could not crawl this website: {audit.error}. Check the URL or try again.</div> : null}

      {audit && !audit.error ? (
        <>
          {/* platform + connection */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div style={panel}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.5 }}>Detected Platform</div>
              <div style={{ fontSize: 24, fontWeight: 800, textTransform: 'capitalize', marginTop: 6 }}>{audit.platform}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Confidence: {Math.round(audit.platform_confidence * 100)}%</div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>{(platform?.evidence || []).slice(0, 3).map((e: string) => <div key={e}>• {e}</div>)}</div>
            </div>
            <div style={panel}>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.5 }}>Website Connection</div>
              {audit.connected ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#6ee7b7', marginTop: 6 }}>Connected</div>
                  <div style={{ fontSize: 13, opacity: 0.75 }}>One-tap optimization available for supported fixes.</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fcd34d', marginTop: 6, textTransform: 'capitalize' }}>{audit.platform} not connected</div>
                  <div style={{ fontSize: 13, opacity: 0.7, margin: '4px 0 10px' }}>One-tap optimization needs website access.</div>
                  <a href="/agents/seo/connections" style={{ ...btn('rgba(139,124,246,0.2)', '#c4b5fd'), textDecoration: 'none' }}>Connect {audit.platform}</a>
                </>
              )}
            </div>
          </div>

          {/* score + counts */}
          <div style={{ ...panel, marginTop: 16, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring score={audit.score} />
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 8 }}>
                {Object.entries(cats).map(([k, v]: any) => (
                  <div key={k} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '9px 11px' }}>
                    <div style={{ fontSize: 11.5, opacity: 0.6, textTransform: 'capitalize' }}>{k}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: v.score >= 80 ? '#6ee7b7' : v.score >= 50 ? '#fcd34d' : '#f87171' }}>{v.score}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Badge bg="rgba(16,185,129,0.14)" fg="#6ee7b7">{audit.counts.auto_fix} one-tap</Badge>
                <Badge bg="rgba(59,130,246,0.14)" fg="#93c5fd">{audit.counts.copy_ready} copy-ready</Badge>
                <Badge bg="rgba(245,158,11,0.14)" fg="#fcd34d">{audit.counts.manual_only} manual</Badge>
                <Badge bg="rgba(148,163,184,0.14)" fg="#cbd5e1">{audit.counts.unsupported} unsupported</Badge>
              </div>
            </div>
          </div>

          {/* quick wins */}
          {quickWins.length ? (
            <div style={{ ...panel, marginTop: 16 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>⚡ Quick Wins Pixie Can Fix First</div>
              {quickWins.map(IssueCard)}
            </div>
          ) : null}

          {/* tabs + issues */}
          <div style={{ display: 'flex', gap: 6, marginTop: 18, flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{ ...btn(tab === t ? '#c4b5fd' : 'rgba(255,255,255,0.05)', tab === t ? '#160a2e' : 'white'), fontWeight: tab === t ? 700 : 500 }}>{t}</button>
            ))}
          </div>
          <div style={{ ...panel, marginTop: 12 }}>
            {tab === 'Overview' ? (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Category scores</div>
                {Object.entries(cats).map(([k, v]: any) => (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ textTransform: 'capitalize' }}>{k}</span><span>{v.score}% · {v.passed}/{v.total}</span></div>
                    <div style={{ height: 7, background: 'rgba(255,255,255,0.07)', borderRadius: 4, marginTop: 4 }}>
                      <div style={{ height: 7, width: `${v.score}%`, borderRadius: 4, background: v.score >= 80 ? '#6ee7b7' : v.score >= 50 ? '#fcd34d' : '#f87171' }} />
                    </div>
                  </div>
                ))}
              </>
            ) : tab === 'Connection' ? (
              <div style={{ fontSize: 14, opacity: 0.85 }}>Detected platform <b style={{ textTransform: 'capitalize' }}>{audit.platform}</b>. <a href="/agents/seo/connections" style={{ color: '#c4b5fd' }}>Connect it</a> to turn copy-ready fixes into one-tap, approval-gated optimizations.</div>
            ) : (
              <>{filtered.length === 0 ? <div style={{ opacity: 0.5, fontSize: 13 }}>No issues in this tab.</div> : filtered.map(IssueCard)}</>
            )}
          </div>
        </>
      ) : null}

      {/* approval drawer */}
      {drawer ? (
        <div onClick={() => setDrawer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(2,7,10,0.6)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px,94vw)', height: '100%', background: '#0a0f16', borderLeft: '1px solid rgba(255,255,255,0.1)', padding: 26, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, margin: 0 }}>Approve SEO Optimization</h2>
              <button onClick={() => setDrawer(null)} style={btn('rgba(255,255,255,0.06)')}>✕</button>
            </div>
            <div style={{ fontSize: 13.5, marginTop: 16 }}>
              <div style={{ opacity: 0.55, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Issue</div>
              <div style={{ fontWeight: 650, marginBottom: 12 }}>{drawer.issue.issue}</div>
              <div style={{ opacity: 0.55, fontSize: 12 }}>Affected page</div>
              <div style={{ marginBottom: 12, wordBreak: 'break-all' }}>{drawer.issue.page_url}</div>
              {drawer.prep?.status === 'approval_required' ? (
                <>
                  <div style={{ opacity: 0.55, fontSize: 12 }}>Pixie suggests</div>
                  <div style={{ background: 'rgba(139,124,246,0.1)', border: '1px solid rgba(139,124,246,0.25)', borderRadius: 10, padding: '10px 12px', margin: '4px 0 12px' }}>{drawer.prep.new_value}</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12.5, opacity: 0.75, marginBottom: 16 }}>
                    <span>Risk: <b>{drawer.prep.fix_mode === 'approval_required' ? 'medium' : 'low'}</b></span>
                    <span>Provider: <b style={{ textTransform: 'capitalize' }}>{drawer.prep.platform}</b></span>
                  </div>
                  {drawer.applied ? (
                    <div style={{ color: drawer.applied.executed ? '#6ee7b7' : '#fcd34d', fontSize: 14 }}>{drawer.applied.detail}</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => void approve(drawer.prep.approval_id)} disabled={busy === 'approve'} style={btn('linear-gradient(90deg,#10b981,#059669)')}>Approve &amp; Apply</button>
                      <button onClick={() => setDrawer(null)} style={btn('rgba(255,255,255,0.06)')}>Skip</button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ color: '#93c5fd', fontSize: 13.5, marginBottom: 8 }}>{drawer.prep?.message}</div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>{drawer.prep?.copy_text}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => copyFix(drawer.prep?.copy_text || '')} style={btn('rgba(139,124,246,0.2)', '#c4b5fd')}>Copy Fix</button>
                    <a href="/agents/seo/connections" style={{ ...btn('rgba(255,255,255,0.06)'), textDecoration: 'none' }}>Connect Website</a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#12161d', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '11px 20px', fontSize: 13.5, zIndex: 60, boxShadow: '0 20px 50px -20px rgba(0,0,0,0.8)' }}>{toast}</div> : null}
    </main>
  );
}
