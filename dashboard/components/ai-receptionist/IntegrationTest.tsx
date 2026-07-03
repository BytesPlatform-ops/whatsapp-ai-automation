'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * AI Receptionist Real Integration Test.
 *
 * Everything routes through /api/test-proxy (same-origin → no CORS) to the
 * FastAPI backend. Flow mirrors the real vertical slice:
 *   1. Status (GET /api/integrations/status) → exec mode + OpenAI provider/model
 *      + per-capability connection status.
 *   2. Submit a customer message (POST /api/agents/ai-receptionist/run) → OpenAI
 *      generates a structured reply, a lead is captured, an approval is filed.
 *   3. Approval card → Approve runs the MOCK executor (nothing really sent),
 *      Skip dismisses, Edit lets you tweak the reply before approving.
 *   4. Activity feed (GET /api/activity) shows the whole trace.
 * No real customer action is executed unless a real tool is connected AND the
 * backend is in production+real execution mode.
 */

interface ProxyResult {
  ok: boolean;
  status: number;
  ms: number;
  data?: any;
  error?: string;
}

async function callProxy(baseUrl: string, method: string, path: string, body?: unknown): Promise<ProxyResult> {
  const res = await fetch('/api/test-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: baseUrl || undefined, method, path, body }),
  });
  return (await res.json()) as ProxyResult;
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 20,
};
const input: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '8px 10px',
  color: 'white',
  width: '100%',
  fontSize: 14,
};
const label: React.CSSProperties = { fontSize: 12, opacity: 0.6, marginBottom: 4, display: 'block' };
const RISK_COLOR: Record<string, string> = { low: '#6ee7b7', medium: '#fcd34d', high: '#fda4af' };
const STATUS_COLOR: Record<string, string> = {
  active: '#6ee7b7',
  mock_available: '#93c5fd',
  ready: '#6ee7b7',
  missing_connection: '#fda4af',
};

const SAMPLE = {
  from_name: 'Sarah',
  from_email: 'sarah@example.com',
  subject: 'Pricing and availability',
  body: 'Hi, can you tell me your pricing and if you are available this Friday?',
};

export function IntegrationTest() {
  const [baseUrl, setBaseUrl] = useState('');
  const [tenant, setTenant] = useState('demo_tenant');
  const [status, setStatus] = useState<any>(null);
  const [google, setGoogle] = useState<any>(null);
  const [form, setForm] = useState(SAMPLE);
  const [run, setRun] = useState<any>(null);
  const [approval, setApproval] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [editReply, setEditReply] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const s = await callProxy(baseUrl, 'GET', `/api/integrations/status?tenant_id=${encodeURIComponent(tenant)}`);
    setStatus(s.data ?? { error: s.error });
    const gs = await callProxy(baseUrl, 'GET', `/api/integrations/google/status?tenant_id=${encodeURIComponent(tenant)}`);
    setGoogle(gs.data ?? { error: gs.error });
    const ev = await callProxy(baseUrl, 'GET', `/api/activity?tenant_id=${encodeURIComponent(tenant)}&limit=20`);
    setActivity(Array.isArray(ev.data) ? ev.data : []);
  }, [baseUrl, tenant]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // The OAuth popup posts back here when Google finishes; refresh on success.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const t = (e.data as any)?.type;
      if (t === 'google-connected' || t === 'google-connect-error') void refreshStatus();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshStatus]);

  // The popup must hit the backend directly (a top-level navigation, not the JSON
  // proxy). Use the typed backend origin, defaulting to localhost:8000.
  function connectGmail() {
    const origin = (baseUrl || 'http://localhost:8000').replace(/\/+$/, '');
    const url = `${origin}/api/integrations/google/connect?tenant_id=${encodeURIComponent(tenant)}`;
    window.open(url, 'pixie-google', 'width=520,height=660');
  }

  async function disconnectGmail() {
    setBusy('disconnect');
    await callProxy(baseUrl, 'POST', '/api/integrations/google/disconnect', { tenant_id: tenant });
    setBusy('');
    await refreshStatus();
  }

  async function submit() {
    setBusy('run');
    setApproval(null);
    setEditReply(null);
    const r = await callProxy(baseUrl, 'POST', '/api/agents/ai-receptionist/run', {
      tenant_id: tenant,
      source: 'manual',
      from_name: form.from_name,
      from_email: form.from_email,
      subject: form.subject,
      body: form.body,
    });
    setRun(r.ok ? r.data : { error: r.error || r.data?.detail || `HTTP ${r.status}` });
    setBusy('');
    await refreshStatus();
    if (r.ok && r.data?.approval_id) await loadApproval(r.data.approval_id);
  }

  async function loadApproval(id: string) {
    const a = await callProxy(baseUrl, 'GET', `/api/approvals?tenant_id=${encodeURIComponent(tenant)}`);
    const found = Array.isArray(a.data) ? a.data.find((x: any) => x.id === id) : null;
    setApproval(found ?? null);
  }

  async function resolve(action: 'approve' | 'skip') {
    if (!approval) return;
    setBusy(action);
    await callProxy(baseUrl, 'POST', `/api/approvals/${approval.id}/${action}`, {
      tenant_id: tenant,
      now: new Date().toISOString(),
    });
    setBusy('');
    await loadApproval(approval.id);
    await refreshStatus();
  }

  async function saveEdit() {
    if (!approval || editReply === null) return;
    setBusy('edit');
    const po = { ...(approval.prepared_output || {}) };
    po.reply = editReply;
    // keep the email action body in sync with the edited reply
    if (Array.isArray(po.execution_actions) && po.execution_actions[0]?.payload) {
      po.execution_actions = po.execution_actions.map((a: any) =>
        a.capability === 'email_send' ? { ...a, payload: { ...a.payload, body: editReply } } : a,
      );
    }
    await callProxy(baseUrl, 'POST', `/api/approvals/${approval.id}/edit`, {
      tenant_id: tenant,
      prepared_output: po,
      preview: editReply.slice(0, 120),
      now: new Date().toISOString(),
    });
    setBusy('');
    setEditReply(null);
    await loadApproval(approval.id);
  }

  const realAllowed = status?.real_execution_allowed === true;
  const openai = status?.openai || {};
  const po = run?.prepared_output || {};
  const exec = approval?.execution_result;

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, margin: 0 }}>
          AI Receptionist Real Integration Test
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <label style={{ opacity: 0.6 }}>tenant</label>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} style={{ ...input, width: 130 }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default backend" style={{ ...input, width: 190 }} />
          <button onClick={() => void refreshStatus()} style={btn('rgba(255,255,255,0.1)')}>Refresh</button>
        </div>
      </div>

      {/* 1. Mode banner */}
      <div style={{
        ...card, marginTop: 16, display: 'flex', alignItems: 'center', gap: 12,
        borderColor: realAllowed ? 'rgba(244,63,94,0.4)' : 'rgba(16,185,129,0.35)',
        background: realAllowed ? 'rgba(244,63,94,0.08)' : 'rgba(16,185,129,0.06)',
      }}>
        <span style={{ fontSize: 22 }}>{realAllowed ? '⚡' : '🛡️'}</span>
        <div>
          <div style={{ fontWeight: 700 }}>
            {realAllowed ? 'Real AI + Real Execution' : 'Real AI + Mock Execution'}
          </div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            {realAllowed
              ? 'Approved actions will run through connected tools.'
              : 'OpenAI is generating the reply. No real email or calendar action will be executed.'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7, textAlign: 'right' }}>
          <div>agent_mode: <b>{status?.agent_mode ?? '—'}</b></div>
          <div>execution_mode: <b>{status?.execution_mode ?? '—'}</b></div>
        </div>
      </div>

      {/* 1b. Connect real tools (Gmail / Calendar via Google OAuth) */}
      <div style={{ ...card, marginTop: 16, borderColor: google?.connected ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ ...h3, margin: 0 }}>Connect Gmail &amp; Calendar</h3>
            <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
              {google?.connected
                ? <>Connected as <b style={{ color: '#6ee7b7' }}>{google.email || 'your Google account'}</b>. Approved emails send for real.</>
                : google?.configured
                  ? 'Click Connect, approve in the Google popup, and approved actions will run for real.'
                  : 'Google OAuth is not configured yet — add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to backend .env.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {google?.connected ? (
              <button onClick={() => void disconnectGmail()} disabled={busy === 'disconnect'} style={btn('rgba(255,255,255,0.1)')}>
                {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : (
              <button onClick={connectGmail} disabled={google && !google.configured} style={{ ...btn('#ea4335'), fontWeight: 700, opacity: google && !google.configured ? 0.5 : 1 }}>
                Connect Gmail
              </button>
            )}
          </div>
        </div>
        {google && !google.configured ? (
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 10, lineHeight: 1.5 }}>
            Setup (once): Google Cloud Console → Credentials → Create OAuth client (Web) → enable Gmail API + Calendar API →
            add redirect URI <code style={{ color: '#93c5fd' }}>{google.redirect_uri}</code> → paste id/secret into backend .env → restart.
          </div>
        ) : null}
      </div>

      {/* 2 + 3. OpenAI status + connection status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={card}>
          <h3 style={h3}>OpenAI status</h3>
          <Row k="LLM Provider" v={status?.llm_provider ?? '—'} />
          <Row k="Model" v={openai.model ?? status?.model ?? '—'} />
          <Row
            k="Status"
            v={openai.status ?? '—'}
            color={openai.status === 'configured' ? '#6ee7b7' : openai.status === 'missing_key' ? '#fda4af' : '#93c5fd'}
          />
          {openai.note ? <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>{openai.note}</div> : null}
        </div>
        <div style={card}>
          <h3 style={h3}>Connection status</h3>
          {(status?.capabilities || []).map((c: any) => (
            <div key={c.capability} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
              <span style={{ opacity: 0.85 }}>{c.capability}</span>
              <span style={{ color: STATUS_COLOR[c.status] || 'white' }}>
                {c.status} · {c.provider}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Manual test form */}
      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>Customer message</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={label}>Customer name</label><input style={input} value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></div>
          <div><label style={label}>Customer email</label><input style={input} value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 12 }}><label style={label}>Subject</label><input style={input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
        <div style={{ marginTop: 12 }}><label style={label}>Message body</label><textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
        <button onClick={() => void submit()} disabled={busy === 'run'} style={{ ...btn('#6366f1'), marginTop: 14, fontWeight: 700, opacity: busy === 'run' ? 0.6 : 1 }}>
          {busy === 'run' ? 'Running OpenAI…' : 'Run AI Receptionist'}
        </button>
      </div>

      {/* 5. Generated output */}
      {run?.error ? (
        <div style={{ ...card, marginTop: 16, borderColor: 'rgba(244,63,94,0.4)', background: 'rgba(244,63,94,0.08)' }}>
          <b>Backend error:</b> {String(run.error)}
        </div>
      ) : run ? (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ ...h3, margin: 0 }}>Generated output</h3>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(99,102,241,0.2)', color: '#c7d2fe' }}>
              Generated by {run.llm_provider === 'openai' ? 'OpenAI' : 'mock'} · {run.model}
            </span>
          </div>
          <Row k="Intent" v={run.intent} />
          <Row k="Lead" v={`${po.lead?.name || '—'} · ${po.lead?.email || '—'} (${run.lead_id})`} />
          <div style={{ marginTop: 10 }}><div style={label}>Prepared reply</div><div style={quote}>{po.reply}</div></div>
          {po.internal_notes ? <div style={{ marginTop: 10 }}><div style={label}>Internal notes</div><div style={{ fontSize: 13, opacity: 0.8 }}>{po.internal_notes}</div></div> : null}
          {Array.isArray(po.recommended_actions) && po.recommended_actions.length ? (
            <div style={{ marginTop: 10 }}>
              <div style={label}>Recommended actions</div>
              {po.recommended_actions.map((a: any, i: number) => (
                <div key={i} style={{ fontSize: 13, opacity: 0.85 }}>• {a.capability} → {a.tool_preference}: {a.description}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 6. Approval card */}
      {approval ? (
        <div style={{ ...card, marginTop: 16, borderColor: 'rgba(252,211,77,0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ ...h3, margin: 0 }}>Approval — {approval.title}</h3>
            <span style={{ fontSize: 12, color: STATUS_COLOR[approval.status] || '#fcd34d' }}>{approval.status}</span>
          </div>
          <Row k="Receives" v={po.lead?.email || form.from_email} />
          <Row k="Tool" v={approval.tool} />
          <Row k="Risk" v={approval.risk_level} color={RISK_COLOR[approval.risk_level]} />
          {editReply !== null ? (
            <div style={{ marginTop: 10 }}>
              <div style={label}>Edit reply</div>
              <textarea style={{ ...input, minHeight: 90 }} value={editReply} onChange={(e) => setEditReply(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => void saveEdit()} disabled={busy === 'edit'} style={btn('#6366f1')}>Save edit</button>
                <button onClick={() => setEditReply(null)} style={btn('rgba(255,255,255,0.1)')}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}><div style={label}>What Pixie will send</div><div style={quote}>{approval.prepared_output?.reply}</div></div>
          )}
          {approval.status === 'pending' && editReply === null ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => void resolve('approve')} disabled={busy === 'approve'} style={{ ...btn('#10b981'), fontWeight: 700 }}>
                {busy === 'approve' ? 'Approving…' : 'Approve'}
              </button>
              <button onClick={() => setEditReply(approval.prepared_output?.reply || '')} style={btn('rgba(255,255,255,0.1)')}>Edit</button>
              <button onClick={() => void resolve('skip')} disabled={busy === 'skip'} style={btn('rgba(255,255,255,0.1)')}>Skip</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 7. Execution result */}
      {exec ? (
        <div style={{ ...card, marginTop: 16, borderColor: exec.executed ? 'rgba(244,63,94,0.4)' : 'rgba(16,185,129,0.35)', background: exec.executed ? 'rgba(244,63,94,0.06)' : 'rgba(16,185,129,0.05)' }}>
          <h3 style={h3}>Execution result</h3>
          <div style={{ fontSize: 13, opacity: 0.85 }}>{exec.detail}</div>
          {(exec.results || []).map((r: any, i: number) => (
            <div key={i} style={{ fontSize: 13, marginTop: 6 }}>
              <b>{r.provider}</b> · {r.status} — {r.message || r.error}
            </div>
          ))}
        </div>
      ) : null}

      {/* 8. Activity log */}
      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={h3}>Activity log</h3>
        {activity.length === 0 ? <div style={{ opacity: 0.5, fontSize: 13 }}>No activity yet.</div> : null}
        {activity.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '3px 0', opacity: 0.9 }}>
            <span style={{ color: '#93c5fd', minWidth: 160 }}>{e.type}</span>
            <span>{e.title}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

function Row({ k, v, color }: { k: string; v: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
      <span style={{ opacity: 0.6 }}>{k}</span>
      <span style={{ color: color || 'white', fontWeight: 600 }}>{v}</span>
    </div>
  );
}

const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: '0 0 10px' };
const quote: React.CSSProperties = {
  fontSize: 14, lineHeight: 1.5, background: 'rgba(255,255,255,0.04)',
  borderLeft: '3px solid rgba(99,102,241,0.6)', borderRadius: 8, padding: '10px 12px', whiteSpace: 'pre-wrap',
};
function btn(bg: string): React.CSSProperties {
  return { background: bg, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 14px', color: 'white', cursor: 'pointer', fontSize: 13 };
}
