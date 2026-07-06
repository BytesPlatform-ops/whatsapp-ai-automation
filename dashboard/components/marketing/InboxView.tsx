'use client';

import { useCallback, useEffect, useState } from 'react';
import { MetaNav } from './MetaNav';
import { MetaHonestyBar } from './MetaHonestyBar';
import { callProxy, card, input, h3, btn, STATUS_COLOR, SENTIMENT_COLOR } from './metaClient';

/**
 * Unified Meta inbox — comments (`type="comment"`) or everything (`type=""`).
 * Left: item list. Middle: selected message. Right: AI panel (Analyze → Prepare
 * reply / Route / Hide → Approve). No public reply happens without approval.
 */
export function InboxView({ type = '', title }: { type?: string; title: string }) {
  const [tenant, setTenant] = useState('demo_tenant');
  const [baseUrl, setBaseUrl] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [storage, setStorage] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<Record<string, any>>({});

  const path = type === 'comment' ? '/api/meta/comments' : '/api/meta/inbox';
  const listKey = type === 'comment' ? 'comments' : 'inbox';

  const refresh = useCallback(async () => {
    const [st, storeSt, perm, list] = await Promise.all([
      callProxy(baseUrl, 'GET', `/api/meta/status?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/content/storage/status`),
      callProxy(baseUrl, 'GET', `/api/meta/permissions?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `${path}?tenant_id=${encodeURIComponent(tenant)}`),
    ]);
    setStatus(st.data ?? null);
    setStorage(storeSt.data ?? null);
    setPermissions(perm.data ?? null);
    setItems(Array.isArray(list.data?.[listKey]) ? list.data[listKey] : []);
  }, [baseUrl, tenant, path, listKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  const sel = items.find((i) => i.id === selId) || null;
  useEffect(() => { setReply(sel?.prepared_reply || ''); }, [selId]); // eslint-disable-line

  async function act(kind: string) {
    if (!sel) return;
    setBusy(kind);
    let r: import('./metaClient').ProxyResult | undefined;
    if (kind === 'analyze') r = await callProxy(baseUrl, 'POST', '/api/agents/marketing/meta/inbox/analyze', { tenant_id: tenant, item_id: sel.id });
    else if (kind === 'prepare') r = await callProxy(baseUrl, 'POST', '/api/agents/marketing/meta/inbox/prepare-reply', { tenant_id: tenant, item_id: sel.id, reply });
    else if (kind === 'route') r = await callProxy(baseUrl, 'POST', '/api/agents/marketing/meta/inbox/route', { tenant_id: tenant, item_id: sel.id });
    else if (kind === 'hide') r = await callProxy(baseUrl, 'POST', '/api/agents/marketing/meta/inbox/hide', { tenant_id: tenant, item_id: sel.id });
    setResult((p) => ({ ...p, [sel.id]: r?.data }));
    setBusy('');
    await refresh();
  }

  async function resolve(action: 'approve' | 'skip') {
    if (!sel?.approval_id) return;
    setBusy(action);
    const r = await callProxy(baseUrl, 'POST', `/api/approvals/${sel.approval_id}/${action}`, { tenant_id: tenant, now: new Date().toISOString() });
    setResult((p) => ({ ...p, [sel.id]: r?.data }));
    setBusy('');
    await refresh();
  }

  const selResult = sel ? result[sel.id] : null;
  const execDetail = selResult?.execution_result?.detail;

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, margin: 0 }}>{title}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ ...input, width: 130 }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default" style={{ ...input, width: 170 }} />
          <button onClick={() => void refresh()} style={btn('rgba(255,255,255,0.1)')}>Refresh</button>
        </div>
      </div>
      <MetaNav />
      <MetaHonestyBar status={status} storage={storage} permissions={permissions} />

      {!status?.connected ? (
        <div style={{ ...card, marginTop: 16 }}>Not connected. Open <b>Overview</b> and click “Use demo data” or “Connect Meta”.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, marginTop: 16 }}>
          {/* list */}
          <div style={{ ...card, maxHeight: 640, overflowY: 'auto' }}>
            <h3 style={h3}>{items.length} item(s)</h3>
            {items.map((i) => (
              <button key={i.id} onClick={() => setSelId(i.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8, cursor: 'pointer',
                  background: i.id === selId ? 'rgba(199,210,254,0.12)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10, color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <b>{i.sender_name}</b>
                  <span style={{ color: STATUS_COLOR[i.status] || '#93c5fd' }}>{i.status}</span>
                </div>
                <div style={{ fontSize: 12.5, opacity: 0.8, margin: '3px 0' }}>{i.message_text.slice(0, 60)}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10.5, opacity: 0.7 }}>
                  <span>{i.platform}·{i.interaction_type}</span>
                  {i.intent !== 'unknown' ? <span>{i.intent}</span> : null}
                  {i.sentiment !== 'neutral' ? <span style={{ color: SENTIMENT_COLOR[i.sentiment] }}>{i.sentiment}</span> : null}
                </div>
              </button>
            ))}
          </div>

          {/* detail + AI panel */}
          <div style={{ ...card }}>
            {!sel ? <div style={{ opacity: 0.5 }}>Select a message.</div> : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ ...h3, margin: 0 }}>{sel.sender_name} · {sel.platform} {sel.interaction_type}</h3>
                  <span style={{ fontSize: 12, color: STATUS_COLOR[sel.status] }}>{sel.status}</span>
                </div>
                <div style={{ fontSize: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px', margin: '10px 0' }}>{sel.message_text}</div>

                <div style={{ display: 'flex', gap: 14, fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                  <span>intent: <b>{sel.intent}</b></span>
                  <span>sentiment: <b style={{ color: SENTIMENT_COLOR[sel.sentiment] }}>{sel.sentiment}</b></span>
                  <span>route: <b>{sel.recommended_route}</b></span>
                  <span>risk: <b>{sel.risk_level}</b></span>
                </div>
                {sel.internal_notes ? <div style={{ fontSize: 12.5, opacity: 0.7, marginBottom: 8 }}>Notes: {sel.internal_notes}</div> : null}

                <div><label style={{ fontSize: 12, opacity: 0.6 }}>Prepared reply (editable)</label>
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} style={{ ...input, minHeight: 80, marginTop: 4 }} placeholder="Analyze to draft a reply, or write one." />
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button onClick={() => void act('analyze')} disabled={busy === 'analyze'} style={btn('#6366f1')}>{busy === 'analyze' ? 'Analyzing…' : 'Analyze'}</button>
                  <button onClick={() => void act('prepare')} disabled={busy === 'prepare' || !reply.trim()} style={btn('#6366f1')}>Prepare reply → approval</button>
                  <button onClick={() => void act('route')} disabled={busy === 'route'} style={btn('rgba(255,255,255,0.1)')}>Route to Receptionist</button>
                  {sel.interaction_type === 'comment' ? <button onClick={() => void act('hide')} disabled={busy === 'hide'} style={btn('rgba(255,255,255,0.1)')}>Hide (spam) → approval</button> : null}
                </div>

                {sel.status === 'pending_approval' && sel.approval_id ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <button onClick={() => void resolve('approve')} disabled={busy === 'approve'} style={{ ...btn('#10b981'), fontWeight: 700 }}>Approve &amp; send</button>
                    <button onClick={() => void resolve('skip')} style={btn('rgba(255,255,255,0.1)')}>Skip</button>
                  </div>
                ) : null}

                {execDetail ? <div style={{ marginTop: 12, fontSize: 13, color: selResult?.execution_result?.executed ? '#fda4af' : '#6ee7b7' }}>{execDetail}</div> : null}
                {selResult?.status && selResult.status !== 'approval_required' && selResult.status !== 'analyzed' && selResult.status !== 'routed' && !execDetail ? (
                  <div style={{ marginTop: 12, fontSize: 13, color: '#fcd34d' }}>{selResult.message || selResult.status}</div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
