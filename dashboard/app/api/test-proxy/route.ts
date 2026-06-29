import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Test proxy — the testing console calls THIS (same-origin), and it forwards to
 * the real Pixie backend. Two reasons:
 *   1. No CORS: the browser never hits the FastAPI origin directly, so no backend
 *      CORS change is needed.
 *   2. Central base-URL + Bearer token injection (entered in the console UI).
 *
 * It is a thin pass-through: it returns the upstream status, parsed body (JSON or
 * text), round-trip time, and any transport error — so the console can show the
 * raw truth of how each agent responds.
 */

interface ProxyBody {
  baseUrl?: string;
  token?: string;
  method?: string;
  path?: string;
  body?: unknown; // JSON body for POST/PUT/PATCH
}

const DEFAULT_BASE = process.env.PIXIE_BACKEND_URL || 'http://localhost:8000';

export async function POST(req: Request) {
  let p: ProxyBody;
  try {
    p = (await req.json()) as ProxyBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid proxy request body' }, { status: 400 });
  }

  const base = (p.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  const path = p.path || '';
  const method = (p.method || 'POST').toUpperCase();
  const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (p.token) headers.Authorization = `Bearer ${p.token}`;

  const init: RequestInit = { method, headers, cache: 'no-store' };
  if (method !== 'GET' && method !== 'HEAD' && p.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(p.body);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  init.signal = controller.signal;

  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const ms = Date.now() - started;
    const ct = res.headers.get('content-type') || '';
    let data: unknown;
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      const text = await res.text();
      data = text.length > 20000 ? text.slice(0, 20000) + '\n…(truncated)' : text;
    }
    clearTimeout(timeout);
    return NextResponse.json(
      { ok: res.ok, status: res.status, statusText: res.statusText, url, ms, data },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    clearTimeout(timeout);
    const ms = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    const unreachable = /ECONNREFUSED|fetch failed|aborted|ENOTFOUND/i.test(msg);
    return NextResponse.json(
      { ok: false, status: 0, url, ms, error: unreachable ? `Backend unreachable at ${base} (${msg})` : msg },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
