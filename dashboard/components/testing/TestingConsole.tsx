'use client';

import { useMemo, useState } from 'react';
import { BOTS, defaultsFor, resolvePath, type BotConfig, type BotAction, type ChatTurn } from './botConfig';

/**
 * TestingConsole — internal tool to test all 5 Pixie bots against the REAL
 * backend from one place. Every request goes through /api/test-proxy (same-origin
 * → no CORS), which injects the base URL + optional Bearer token. State is React
 * only (no localStorage). Shows raw JSON, HTTP status, timing, and a per-bot
 * in-memory history so you can see exactly how each agent receives and answers.
 */

type Pill = 'ready' | 'calling' | 'ok' | 'error' | 'unreachable';

interface ProxyResult {
  ok: boolean;
  status: number;
  statusText?: string;
  url: string;
  ms: number;
  data?: unknown;
  error?: string;
}

interface HistoryEntry {
  label: string;
  status: number;
  ms: number;
  ok: boolean;
  pill: Pill;
}

const PILL_STYLE: Record<Pill, { bg: string; text: string; label: string }> = {
  ready: { bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.6)', label: 'Ready' },
  calling: { bg: 'rgba(234,179,8,0.14)', text: '#fcd34d', label: 'Calling…' },
  ok: { bg: 'rgba(16,185,129,0.16)', text: '#6ee7b7', label: 'OK' },
  error: { bg: 'rgba(244,63,94,0.16)', text: '#fda4af', label: 'Error' },
  unreachable: { bg: 'rgba(244,63,94,0.16)', text: '#fda4af', label: 'Unreachable' },
};

export function TestingConsole() {
  const [botId, setBotId] = useState(BOTS[0].id);
  const bot = useMemo(() => BOTS.find((b) => b.id === botId) as BotConfig, [botId]);

  // Per-bot input values, seeded from each bot's defaults (lazy init).
  const [inputs, setInputs] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(BOTS.map((b) => [b.id, defaultsFor(b)])),
  );
  const v = inputs[botId];

  const [baseUrl, setBaseUrl] = useState('http://localhost:8000');
  const [token, setToken] = useState('');

  const [pill, setPill] = useState<Pill>('ready');
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [lastEndpoint, setLastEndpoint] = useState<string>('');

  const [chat, setChat] = useState<Record<string, ChatTurn[]>>(() =>
    Object.fromEntries(BOTS.map((b) => [b.id, [] as ChatTurn[]])),
  );
  const [chatInput, setChatInput] = useState('');
  const [history, setHistory] = useState<Record<string, HistoryEntry[]>>(() =>
    Object.fromEntries(BOTS.map((b) => [b.id, [] as HistoryEntry[]])),
  );
  const [uploadName, setUploadName] = useState('');
  const [copied, setCopied] = useState(false);

  function setField(key: string, value: string) {
    setInputs((prev) => ({ ...prev, [botId]: { ...prev[botId], [key]: value } }));
  }

  function pushHistory(label: string, r: ProxyResult, p: Pill) {
    setHistory((prev) => ({
      ...prev,
      [botId]: [{ label, status: r.status, ms: r.ms, ok: r.ok, pill: p }, ...prev[botId]].slice(0, 8),
    }));
  }

  async function callProxy(method: string, path: string, body: unknown | undefined): Promise<ProxyResult> {
    const res = await fetch('/api/test-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, token: token || undefined, method, path, body }),
    });
    return (await res.json()) as ProxyResult;
  }

  function pillFor(r: ProxyResult): Pill {
    if (r.error) return 'unreachable';
    return r.ok ? 'ok' : 'error';
  }

  async function runAction(a: BotAction) {
    const path = resolvePath(a.path, v);
    setLastEndpoint(`${a.method} ${path}`);
    setPill('calling');
    setResult(null);
    const body = a.method === 'GET' ? undefined : a.body?.(v);
    const r = await callProxy(a.method, path, body);
    const p = pillFor(r);
    setResult(r);
    setPill(p);
    pushHistory(a.label, r, p);
  }

  async function uploadReference() {
    if (!bot.upload || !uploadName) return;
    const path = '/api/content-creator/influencer/upload-reference';
    setLastEndpoint(`POST ${path}`);
    setPill('calling');
    const r = await callProxy('POST', path, { tenant_id: v.tenant_id, reference_ref: uploadName });
    const p = pillFor(r);
    setResult(r);
    setPill(p);
    pushHistory('Upload reference', r, p);
  }

  async function sendChat() {
    if (!bot.chat || !chatInput.trim()) return;
    const msg = chatInput.trim();
    const turns = chat[botId];
    setChat((prev) => ({ ...prev, [botId]: [...prev[botId], { role: 'user', text: msg }] }));
    setChatInput('');
    setLastEndpoint(`${bot.chat.method} ${bot.chat.path}`);
    setPill('calling');
    const body = bot.chat.body(v, msg, turns);
    const r = await callProxy(bot.chat.method, bot.chat.path, body);
    const p = pillFor(r);
    setResult(r);
    setPill(p);
    pushHistory('chat', r, p);
    const reply = r.error ? `⚠ ${r.error}` : !r.ok ? `⚠ HTTP ${r.status}` : bot.chat.reply(r.data);
    setChat((prev) => ({ ...prev, [botId]: [...prev[botId], { role: 'assistant', text: reply }] }));
  }

  function copyOutput() {
    if (!result) return;
    navigator.clipboard?.writeText(JSON.stringify(result.data ?? result.error ?? result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const ps = PILL_STYLE[pill];

  return (
    <div className="flex min-h-screen bg-[#02070a] text-white" style={{ ['--accent' as string]: bot.accent, ['--soft' as string]: bot.soft }}>
      {/* ── Left sidebar ─────────────────────────────────────────────── */}
      <aside className="flex w-64 flex-none flex-col border-r border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="font-display text-lg font-extrabold tracking-tight">Pixie</span>
          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/55">
            Testing
          </span>
        </div>

        <nav className="flex-1 px-3">
          {BOTS.map((b) => {
            const active = b.id === botId;
            return (
              <button
                key={b.id}
                onClick={() => {
                  setBotId(b.id);
                  setResult(null);
                  setPill('ready');
                  setLastEndpoint('');
                }}
                className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
                style={{
                  background: active ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.6)',
                }}
              >
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: b.accent, boxShadow: active ? `0 0 10px ${b.accent}` : 'none' }}
                />
                {b.name}
              </button>
            );
          })}
        </nav>

        {/* Settings */}
        <div className="border-t border-white/10 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">Settings</p>
          <label className="mb-1 block text-[11px] text-white/50">Backend base URL</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:8000"
            className="mb-2 w-full rounded-md border border-white/12 bg-black/30 px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/30"
          />
          <label className="mb-1 block text-[11px] text-white/50">Auth token (optional)</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer …"
            type="password"
            className="w-full rounded-md border border-white/12 bg-black/30 px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/30"
          />
        </div>
      </aside>

      {/* ── Center: inputs ───────────────────────────────────────────── */}
      <section className="flex w-[380px] flex-none flex-col border-r border-white/10 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold" style={{ color: 'var(--soft)' }}>
            {bot.name}
          </h2>
          <span
            className="rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider"
            style={{ background: ps.bg, color: ps.text }}
          >
            {ps.label}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-white/45">{bot.blurb}</p>

        <div className="mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
          {bot.fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45">
                {f.label}
              </label>
              {f.type === 'select' ? (
                <select
                  value={v[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="w-full rounded-md border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                >
                  {f.options?.map((o) => (
                    <option key={o} value={o} className="bg-[#0a1018]">
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  value={v[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-md border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                />
              ) : (
                <input
                  value={v[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full rounded-md border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                />
              )}
            </div>
          ))}

          {/* Upload (Content Creator) */}
          {bot.upload && (
            <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-3">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45">
                {bot.upload.label}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadName(e.target.files?.[0]?.name ?? '')}
                className="block w-full text-xs text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white"
              />
              {uploadName && (
                <button
                  onClick={uploadReference}
                  className="mt-2 rounded-md px-3 py-1.5 text-xs font-semibold"
                  style={{ background: 'var(--accent)', color: '#06110c' }}
                >
                  Upload “{uploadName}”
                </button>
              )}
              <p className="mt-2 text-[10.5px] leading-snug text-white/35">{bot.upload.note}</p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {bot.actions.map((a) => (
            <button
              key={a.id}
              onClick={() => runAction(a)}
              disabled={pill === 'calling'}
              className="rounded-full px-4 py-2 text-xs font-bold tracking-wide transition-transform active:scale-[0.97] disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#06110c' }}
            >
              {a.label}
            </button>
          ))}
        </div>
        {lastEndpoint && <p className="mt-2 font-mono text-[11px] text-white/40">→ {lastEndpoint}</p>}
      </section>

      {/* ── Right: chat + output ─────────────────────────────────────── */}
      <section className="flex flex-1 flex-col p-5">
        {/* Chat */}
        {bot.chat ? (
          <div className="mb-4 flex flex-col rounded-xl border border-white/10 bg-white/[0.02]">
            <div className="border-b border-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-white/45">
              Web chat → {bot.chat.path}
            </div>
            <div className="max-h-52 min-h-[80px] space-y-2 overflow-y-auto p-3">
              {chat[botId].length === 0 && <p className="text-xs text-white/30">No messages yet. Send one below.</p>}
              {chat[botId].map((t, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-[13px] ${
                    t.role === 'user' ? 'ml-auto bg-white/10 text-white' : 'bg-black/30 text-white/85'
                  }`}
                  style={t.role === 'assistant' ? { border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)' } : undefined}
                >
                  {t.text}
                </div>
              ))}
            </div>
            <div className="flex gap-2 border-t border-white/10 p-3">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder="Type a message…"
                className="flex-1 rounded-md border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              />
              <button
                onClick={sendChat}
                disabled={pill === 'calling'}
                className="rounded-md px-4 py-2 text-sm font-bold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#06110c' }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-3 text-xs text-white/35">
            This bot has no chat endpoint — use the action buttons on the left.
          </div>
        )}

        {/* Output */}
        <div className="flex flex-1 flex-col rounded-xl border border-white/10 bg-black/40">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/45">Raw response</span>
            <div className="flex items-center gap-3 text-[11px] text-white/50">
              {result && (
                <>
                  <span>
                    {result.error ? 'ERR' : `HTTP ${result.status}`} · {result.ms}ms
                  </span>
                  <button onClick={copyOutput} className="rounded border border-white/15 px-2 py-0.5 hover:text-white">
                    {copied ? 'Copied' : 'Copy JSON'}
                  </button>
                </>
              )}
            </div>
          </div>
          <pre className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-relaxed text-white/80">
            {result
              ? result.error
                ? `⚠ ${result.error}`
                : JSON.stringify(result.data, null, 2)
              : 'Run a test or send a chat message to see the agent’s raw response here.'}
          </pre>
        </div>

        {/* History */}
        {history[botId].length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-white/35">Recent calls</p>
            <div className="space-y-1">
              {history[botId].map((h, i) => (
                <div key={i} className="flex items-center gap-3 text-[11px] text-white/55">
                  <span
                    className="rounded px-1.5 py-0.5 font-bold"
                    style={{ background: PILL_STYLE[h.pill].bg, color: PILL_STYLE[h.pill].text }}
                  >
                    {h.ok ? h.status : h.pill === 'unreachable' ? 'DOWN' : h.status}
                  </span>
                  <span className="text-white/70">{h.label}</span>
                  <span className="ml-auto">{h.ms}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
