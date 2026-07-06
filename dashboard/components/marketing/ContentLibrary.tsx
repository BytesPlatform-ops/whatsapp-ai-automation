'use client';

import { useCallback, useEffect, useState } from 'react';
import { MetaNav } from './MetaNav';
import { MetaHonestyBar } from './MetaHonestyBar';
import { callProxy, card, input, h3, btn, STATUS_COLOR, mediaSrc } from './metaClient';

/** Content Library — uploaded media, prepared/published history, blocked attempts. */
export function ContentLibrary() {
  const [tenant, setTenant] = useState('demo_tenant');
  const [baseUrl, setBaseUrl] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [storage, setStorage] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [published, setPublished] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [form, setForm] = useState<Record<string, any>>({}); // per-asset prepare form

  const refresh = useCallback(async () => {
    const [st, storeSt, perm, a, pub, ap] = await Promise.all([
      callProxy(baseUrl, 'GET', `/api/meta/status?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/content/storage/status`),
      callProxy(baseUrl, 'GET', `/api/meta/permissions?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/content/assets?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/meta/content?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/approvals?tenant_id=${encodeURIComponent(tenant)}`),
    ]);
    setStatus(st.data ?? null); setStorage(storeSt.data ?? null); setPermissions(perm.data ?? null);
    setAssets(a.data?.assets ?? []);
    setPublished(pub.data?.content ?? []);
    setApprovals(Array.isArray(ap.data) ? ap.data.filter((x: any) => x.agent === 'marketing-agent') : []);
  }, [baseUrl, tenant]);

  useEffect(() => { void refresh(); }, [refresh]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(''); setBusy('upload');
    const reader = new FileReader();
    reader.onload = async () => {
      const r = await callProxy(baseUrl, 'POST', '/api/content/assets', {
        tenant_id: tenant, filename: file.name, content_type: file.type || 'application/octet-stream',
        data_base64: String(reader.result || '').split(',')[1] || '',
      });
      setBusy('');
      if (!r.ok) setErr(r.data?.detail || r.error || 'Upload failed');
      await refresh();
    };
    reader.readAsDataURL(file);
  }

  async function prepare(assetId: string) {
    const f = form[assetId] || { platform: 'instagram', content_type: 'reel', idea: 'a strong post for this business' };
    setBusy(`prep:${assetId}`); setErr('');
    const r = await callProxy(baseUrl, 'POST', '/api/agents/marketing/meta/prepare-post', {
      tenant_id: tenant, media_asset_id: assetId, ...f,
    });
    setBusy('');
    if (r.data?.status && r.data.status !== 'approval_required') setErr(r.data.message || r.data.status);
    await refresh();
  }

  async function del(assetId: string) {
    setBusy(`del:${assetId}`);
    await callProxy(baseUrl, 'DELETE', `/api/content/assets/${assetId}?tenant_id=${encodeURIComponent(tenant)}`);
    setBusy(''); await refresh();
  }

  const prepared = approvals.filter((a) => a.capability?.includes('publish'));
  const blocked = published.filter((p) => p.status === 'failed');

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, margin: 0 }}>Content Library</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ ...input, width: 130 }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default" style={{ ...input, width: 170 }} />
          <button onClick={() => void refresh()} style={btn('rgba(255,255,255,0.1)')}>Refresh</button>
        </div>
      </div>
      <MetaNav />
      <MetaHonestyBar status={status} storage={storage} permissions={permissions} />

      {/* Upload */}
      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>Upload media</h3>
        <input type="file" accept="image/*,video/*" onChange={onPickFile} disabled={busy === 'upload'} style={{ ...input, padding: 6 }} />
        {busy === 'upload' ? <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>Uploading to {storage?.provider}…</div> : null}
        {err ? <div style={{ fontSize: 13, color: '#fda4af', marginTop: 8 }}>{err}</div> : null}
      </div>

      {/* Asset library */}
      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>Uploaded media ({assets.length})</h3>
        {assets.length === 0 ? <div style={{ opacity: 0.5, fontSize: 13 }}>No media yet.</div> : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {assets.map((a) => {
            const f = form[a.id] || { platform: 'instagram', content_type: 'reel', idea: '' };
            return (
              <div key={a.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  {String(a.mime_type).startsWith('image/')
                    ? <img src={mediaSrc(baseUrl, a.public_url)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                    : <video src={mediaSrc(baseUrl, a.public_url)} style={{ width: 80, height: 64, objectFit: 'cover', borderRadius: 8 }} muted />}
                  <div style={{ fontSize: 12, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</div>
                    <div style={{ opacity: 0.7 }}>{(a.size_bytes / 1024).toFixed(0)} KB · {a.storage_provider}</div>
                    <div style={{ color: a.public_url?.startsWith('http') && a.storage_provider === 'supabase' ? '#6ee7b7' : '#fcd34d' }}>
                      {a.storage_provider === 'supabase' ? 'Meta-reachable ✓' : 'mock-only'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <select value={f.platform} onChange={(e) => setForm((p) => ({ ...p, [a.id]: { ...f, platform: e.target.value } }))} style={{ ...input, fontSize: 12, padding: 4 } as any}>
                    <option value="instagram">Instagram</option><option value="facebook">Facebook</option>
                  </select>
                  <select value={f.content_type} onChange={(e) => setForm((p) => ({ ...p, [a.id]: { ...f, content_type: e.target.value } }))} style={{ ...input, fontSize: 12, padding: 4 } as any}>
                    <option value="reel">Reel</option><option value="post">Post</option><option value="photo">Photo</option><option value="video">Video</option>
                  </select>
                </div>
                <input value={f.idea} onChange={(e) => setForm((p) => ({ ...p, [a.id]: { ...f, idea: e.target.value } }))} placeholder="idea / topic" style={{ ...input, fontSize: 12, marginTop: 6 }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => void prepare(a.id)} disabled={busy === `prep:${a.id}`} style={{ ...btn('#6366f1'), fontSize: 12 }}>Prepare with Pixie</button>
                  <button onClick={() => void del(a.id)} disabled={busy === `del:${a.id}`} style={{ ...btn('rgba(255,255,255,0.1)'), fontSize: 12 }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Prepared (awaiting approval) */}
      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>Prepared — awaiting approval ({prepared.filter((p) => p.status === 'pending').length})</h3>
        {prepared.filter((p) => p.status === 'pending').map((p) => (
          <div key={p.id} style={{ fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, marginTop: 8 }}>
            <b>{p.title}</b> — {p.prepared_output?.caption?.slice(0, 90)} <span style={{ opacity: 0.6 }}>→ {p.prepared_output?.will_publish_to} · {p.tool}</span>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Approve on the <b>Approvals</b> tab.</div>
          </div>
        ))}
        {prepared.filter((p) => p.status === 'pending').length === 0 ? <div style={{ opacity: 0.5, fontSize: 13 }}>Nothing prepared.</div> : null}
      </div>

      {/* Published history */}
      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>Published history ({published.length})</h3>
        {published.length === 0 ? <div style={{ opacity: 0.5, fontSize: 13 }}>Nothing published yet.</div> : null}
        {published.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 0' }}>
            <span>{p.platform} · {p.content_type} · {p.caption?.slice(0, 60) || '(no caption)'}</span>
            <span style={{ color: STATUS_COLOR[p.status] }}>{p.status}{p.meta_post_id ? ` · ${p.meta_post_id}` : ''}</span>
          </div>
        ))}
        {blocked.length ? <div style={{ fontSize: 12, color: '#fda4af', marginTop: 8 }}>{blocked.length} failed/blocked attempt(s).</div> : null}
      </div>
    </main>
  );
}
