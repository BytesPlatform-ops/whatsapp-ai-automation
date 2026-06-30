import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Entitlements proxy — same-origin bridge to the Python entitlements service.
 *   GET  ?tenant_id=            → all agents' states
 *   POST { action: 'start_trial' | 'checkout', tenant_id, agent }
 * Degrades to backendUp:false when the engine is down (UI falls back to mock).
 */

const BACKEND = process.env.PIXIE_BACKEND_URL || 'http://localhost:8000';

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms = 2500): Promise<T> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fn(c.signal);
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: Request) {
  const tenant = new URL(req.url).searchParams.get('tenant_id') || 'demo';
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(`${BACKEND}/api/entitlements?tenant_id=${encodeURIComponent(tenant)}`, {
        signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return NextResponse.json({ backendUp: false }, { status: 200 });
      return NextResponse.json({ backendUp: true, entitlements: await res.json() }, { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch {
    return NextResponse.json({ backendUp: false }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, string>;
  const { action, tenant_id = 'demo', agent } = body;
  if (!agent) return NextResponse.json({ ok: false, error: 'agent required' }, { status: 400 });

  const path =
    action === 'checkout' ? '/api/entitlements/create-checkout'
    : action === 'activate' ? '/api/entitlements/activate'
    : '/api/entitlements/start-trial';
  // start-trial passes deterministic ISO timestamps from the client (backend avoids time.*).
  const now = new Date();
  const ends = new Date(now.getTime() + 7 * 86_400_000);
  const payload =
    action === 'checkout' ? { tenant_id, agent }
    : action === 'activate' ? { tenant_id, agent, source: 'signup_flow' }
    : { tenant_id, agent, now: now.toISOString(), ends: ends.toISOString() };

  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(`${BACKEND}${path}`, {
        method: 'POST',
        signal,
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
    });
  } catch {
    return NextResponse.json({ ok: false, backendUp: false }, { status: 200 });
  }
}
