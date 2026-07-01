'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * TestLab — the zero-cost agent workflow tester. Everything routes through
 * /api/test-proxy (same-origin → no CORS) to the FastAPI backend. Flow:
 *   1. Mode banner (GET /api/mode) proves we're in test/mock — no real actions.
 *   2. Pick a seeded signal (GET /api/omni/signals) and Run it (POST /api/omni/run):
 *      Omni routes it to an agent, prepares a draft, and files an approval.
 *   3. Approvals queue (GET /api/approvals) → Approve runs the MOCK executor,
 *      Skip dismisses. Approve → execution_result shows nothing was really sent.
 *   4. Activity feed (GET /api/activity) shows the whole trace.
 * State is React-only. No real customer action is ever executed in test mode.
 */

interface ProxyResult {
  ok: boolean;
  status: number;
  ms: number;
  data?: any;
  error?: string;
}

interface Signal {
  id: string;
  type: string;
  source: string;
  message: string;
}

interface Approval {
  id: string;
  agent: string;
  title: string;
  status: string;
  action_type: string;
  risk_level: string;
  capability: string;
  tool: string;
  prepared_output: Record<string, unknown>;
  preview: string;
  execution_result: Record<string, unknown> | null;
}

interface ActivityEvent {
  id: string;
  agent: string;
  type: string;
  title: string;
}

const RISK_COLOR: Record<string, string> = {
  low: '#6ee7b7',
  medium: '#fcd34d',
  high: '#fda4af',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#fcd34d',
  executed: '#6ee7b7',
  rejected: '#fda4af',
  skipped: 'rgba(255,255,255,0.5)',
};

async function callProxy(baseUrl: string, method: string, path: string, body?: unknown): Promise<ProxyResult> {
  const res = await fetch('/api/test-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // empty baseUrl → let the proxy use its configured PIXIE_BACKEND_URL
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

export function TestLab() {
  const [baseUrl, setBaseUrl] = useState(''); // '' → proxy uses its PIXIE_BACKEND_URL
  const [tenant, setTenant] = useState('demo_tenant');

  const [mode, setMode] = useState<any>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [busy, setBusy] = useState<string>('');
  const [lastRun, setLastRun] = useState<any>(null);

  const refresh = useCallback(async () => {
    const [m, s, a, ev] = await Promise.all([
      callProxy(baseUrl, 'GET', '/api/mode'),
      callProxy(baseUrl, 'GET', '/api/omni/signals'),
      callProxy(baseUrl, 'GET', `/api/approvals?tenant_id=${encodeURIComponent(tenant)}`),
      callProxy(baseUrl, 'GET', `/api/activity?tenant_id=${encodeURIComponent(tenant)}&limit=20`),
    ]);
    setMode(m.data ?? { error: m.error });
    setSignals(Array.isArray(s.data) ? s.data : []);
    setApprovals(Array.isArray(a.data) ? a.data : []);
    setActivity(Array.isArray(ev.data) ? ev.data : []);
  }, [baseUrl, tenant]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runSignal(sig: Signal) {
    setBusy(`run:${sig.id}`);
    const r = await callProxy(baseUrl, 'POST', '/api/omni/run', { tenant_id: tenant, signal_id: sig.id });
    setLastRun(r.error ? { error: r.error } : r.data);
    setBusy('');
    await refresh();
  }

  async function resolve(ap: Approval, action: 'approve' | 'skip') {
    setBusy(`${action}:${ap.id}`);
    await callProxy(baseUrl, 'POST', `/api/approvals/${ap.id}/${action}`, { tenant_id: tenant });
    setBusy('');
    await refresh();
  }

  const realAllowed = mode?.real_execution_allowed === true;

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, margin: 0 }}>Pixie Test Lab</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <label style={{ opacity: 0.6 }}>tenant</label>
          <input value={tenant} onChange={(e) => setTenant(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 8px', color: 'white', width: 130 }} />
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="server default backend"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 8px', color: 'white', width: 200 }} />
          <button onClick={() => void refresh()}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 12px', color: 'white', cursor: 'pointer' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Mode banner */}
      <div style={{
        ...card, marginTop: 16, display: 'flex', alignItems: 'center', gap: 12,
        borderColor: realAllowed ? 'rgba(244,63,94,0.4)' : 'rgba(16,185,129,0.35)',
        background: realAllowed ? 'rgba(244,63,94,0.08)' : 'rgba(16,185,129,0.06)',
      }}>
        <span style={{ fontSize: 22 }}>{realAllowed ? '⚠️' : '🧪'}</span>
        <div>
          <div style={{ fontWeight: 700 }}>{mode?.banner ?? 'Loading mode…'}</div>
          {mode && !mode.error && (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              agent_mode: <b>{mode.agent_mode}</b> · execution_mode: <b>{mode.execution_mode}</b> ·
              require_approval: <b>{String(mode.require_approval)}</b> · model_mode: <b>{mode.model_mode}</b>
            </div>
          )}
          {mode?.error && <div style={{ fontSize: 12, color: '#fda4af' }}>Backend unreachable: {String(mode.error)}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        {/* Signals */}
        <section style={card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0 }}>Seeded signals</h2>
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: -6 }}>Pick one → Omni routes it to an agent and prepares a draft.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signals.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.type}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.message}</div>
                </div>
                <button disabled={busy === `run:${s.id}`} onClick={() => void runSignal(s)}
                  style={{ flexShrink: 0, background: '#6366f1', border: 'none', borderRadius: 8, padding: '6px 12px', color: 'white', cursor: 'pointer', opacity: busy === `run:${s.id}` ? 0.5 : 1 }}>
                  {busy === `run:${s.id}` ? 'Running…' : 'Run'}
                </button>
              </div>
            ))}
            {signals.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>No signals (backend reachable?).</div>}
          </div>
          {lastRun && (
            <pre style={{ marginTop: 12, fontSize: 11, background: 'rgba(0,0,0,0.4)', padding: 10, borderRadius: 8, maxHeight: 160, overflow: 'auto' }}>
              {JSON.stringify(lastRun, null, 2)}
            </pre>
          )}
        </section>

        {/* Approvals */}
        <section style={card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0 }}>Approvals queue</h2>
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: -6 }}>Approve → mock executor runs (nothing real is sent). Skip → dismiss.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {approvals.map((ap) => (
              <div key={ap.id} style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ap.title}</div>
                  <span style={{ fontSize: 11, color: STATUS_COLOR[ap.status] ?? '#fff', fontWeight: 700 }}>{ap.status}</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>agent: <b>{ap.agent}</b></span>
                  <span>tool: <b>{ap.tool || '—'}</b></span>
                  <span>risk: <b style={{ color: RISK_COLOR[ap.risk_level] ?? '#fff' }}>{ap.risk_level}</b></span>
                </div>
                {ap.preview && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, fontStyle: 'italic' }}>“{ap.preview}”</div>}
                {ap.execution_result && (
                  <div style={{ fontSize: 11, marginTop: 6, color: '#6ee7b7' }}>
                    ✓ {String((ap.execution_result as any).detail ?? 'executed (mock)')}
                  </div>
                )}
                {ap.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button disabled={busy === `approve:${ap.id}`} onClick={() => void resolve(ap, 'approve')}
                      style={{ background: '#10b981', border: 'none', borderRadius: 8, padding: '5px 14px', color: '#04120c', fontWeight: 700, cursor: 'pointer' }}>
                      Approve
                    </button>
                    <button disabled={busy === `skip:${ap.id}`} onClick={() => void resolve(ap, 'skip')}
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '5px 14px', color: 'white', cursor: 'pointer' }}>
                      Skip
                    </button>
                  </div>
                )}
              </div>
            ))}
            {approvals.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>No approvals yet — run a signal.</div>}
          </div>
        </section>
      </div>

      {/* Activity */}
      <section style={{ ...card, marginTop: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0 }}>Activity feed</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {activity.map((ev) => (
            <div key={ev.id} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ opacity: 0.5, width: 150, flexShrink: 0 }}>{ev.type}</span>
              <span style={{ opacity: 0.5, width: 120, flexShrink: 0 }}>{ev.agent || '—'}</span>
              <span style={{ opacity: 0.85 }}>{ev.title}</span>
            </div>
          ))}
          {activity.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>No activity yet.</div>}
        </div>
      </section>
    </main>
  );
}
