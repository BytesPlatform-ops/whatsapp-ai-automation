'use client';

import { useCallback, useEffect, useState } from 'react';
import { MetaNav } from './MetaNav';
import { MetaHonestyBar } from './MetaHonestyBar';
import { callProxy, card, input, h3, btn, STATUS_COLOR } from './metaClient';

/** Pending approvals for the Marketing Agent (posts, reels, replies, hides). */
export function ApprovalsView() {
  const [tenant, setTenant] = useState('demo_tenant');
  const [baseUrl, setBaseUrl] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [storage, setStorage] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [edit, setEdit] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [st, storeSt, perm, ap] = await Promise.all([
      callProxy(baseUrl, 'GET', `/api/meta/status?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/content/storage/status`),
      callProxy(baseUrl, 'GET', `/api/meta/permissions?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/approvals?tenant_id=${encodeURIComponent(tenant)}`),
    ]);
    setStatus(st.data ?? null); setStorage(storeSt.data ?? null); setPermissions(perm.data ?? null);
    setApprovals(Array.isArray(ap.data) ? ap.data.filter((x: any) => x.agent === 'marketing-agent') : []);
  }, [baseUrl, tenant]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function resolve(ap: any, action: 'approve' | 'skip') {
    setBusy(`${action}:${ap.id}`);
    await callProxy(baseUrl, 'POST', `/api/approvals/${ap.id}/${action}`, { tenant_id: tenant, now: new Date().toISOString() });
    setBusy(''); await refresh();
  }

  async function saveEdit(ap: any) {
    const text = edit[ap.id];
    if (text == null) return;
    setBusy(`edit:${ap.id}`);
    const po = { ...(ap.prepared_output || {}) };
    if (po.reply != null) po.reply = text; else po.caption = text;
    if (Array.isArray(po.execution_actions)) {
      po.execution_actions = po.execution_actions.map((a: any) => {
        const p = { ...(a.payload || {}) };
        if (p.reply != null) p.reply = text; else if (p.caption != null) p.caption = text;
        return { ...a, payload: p };
      });
    }
    await callProxy(baseUrl, 'POST', `/api/approvals/${ap.id}/edit`, { tenant_id: tenant, prepared_output: po, preview: text.slice(0, 120) });
    setEdit((p) => { const n = { ...p }; delete n[ap.id]; return n; });
    setBusy(''); await refresh();
  }

  const pending = approvals.filter((a) => a.status === 'pending');
  const done = approvals.filter((a) => a.status !== 'pending');

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, margin: 0 }}>Pending Approvals</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ ...input, width: 130 }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default" style={{ ...input, width: 170 }} />
          <button onClick={() => void refresh()} style={btn('rgba(255,255,255,0.1)')}>Refresh</button>
        </div>
      </div>
      <MetaNav />
      <MetaHonestyBar status={status} storage={storage} permissions={permissions} />

      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>Awaiting your decision ({pending.length})</h3>
        {pending.length === 0 ? <div style={{ opacity: 0.5, fontSize: 13 }}>Nothing pending.</div> : null}
        {pending.map((ap) => {
          const text = ap.prepared_output?.reply ?? ap.prepared_output?.caption ?? ap.preview;
          const editing = edit[ap.id] != null;
          return (
            <div key={ap.id} style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 14 }}>{ap.title}</b>
                <span style={{ fontSize: 11.5, color: ap.risk_level === 'high' ? '#fda4af' : ap.risk_level === 'medium' ? '#fcd34d' : '#6ee7b7' }}>risk {ap.risk_level} · {ap.tool}</span>
              </div>
              {editing ? (
                <textarea value={edit[ap.id]} onChange={(e) => setEdit((p) => ({ ...p, [ap.id]: e.target.value }))} style={{ ...input, minHeight: 80, marginTop: 8 }} />
              ) : (
                <div style={{ fontSize: 13.5, background: 'rgba(255,255,255,0.04)', borderLeft: '3px solid rgba(99,102,241,0.6)', borderRadius: 8, padding: '10px 12px', marginTop: 8, whiteSpace: 'pre-wrap' }}>{text}</div>
              )}
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
                {ap.prepared_output?.will_publish_to ? `→ ${ap.prepared_output.will_publish_to}` : ap.prepared_output?.sender ? `→ reply to ${ap.prepared_output.sender}` : ''} · {ap.capability}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {editing ? (
                  <>
                    <button onClick={() => void saveEdit(ap)} disabled={busy === `edit:${ap.id}`} style={btn('#6366f1')}>Save edit</button>
                    <button onClick={() => setEdit((p) => { const n = { ...p }; delete n[ap.id]; return n; })} style={btn('rgba(255,255,255,0.1)')}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => void resolve(ap, 'approve')} disabled={busy === `approve:${ap.id}`} style={{ ...btn('#10b981'), fontWeight: 700 }}>Approve</button>
                    <button onClick={() => setEdit((p) => ({ ...p, [ap.id]: text || '' }))} style={btn('rgba(255,255,255,0.1)')}>Edit</button>
                    <button onClick={() => void resolve(ap, 'skip')} disabled={busy === `skip:${ap.id}`} style={btn('rgba(255,255,255,0.1)')}>Skip</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>Resolved ({done.length})</h3>
        {done.slice(0, 20).map((ap) => (
          <div key={ap.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
            <span>{ap.title}</span>
            <span style={{ color: STATUS_COLOR[ap.status] }}>{ap.status}{ap.execution_result?.detail ? ` · ${ap.execution_result.detail}` : ''}</span>
          </div>
        ))}
        {done.length === 0 ? <div style={{ opacity: 0.5, fontSize: 13 }}>None yet.</div> : null}
      </div>
    </main>
  );
}
