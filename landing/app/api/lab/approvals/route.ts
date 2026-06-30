import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Approvals proxy — same-origin bridge to the Python approvals service.
 *   GET  ?tenant_id=                       pending + recent approvals
 *   POST { tenant_id, id, decision }       approve | reject
 */
const BACKEND = process.env.PIXIE_BACKEND_URL || 'http://localhost:8000';

async function timed<T>(fn: (s: AbortSignal) => Promise<T>, ms = 2500): Promise<T> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fn(c.signal); } finally { clearTimeout(t); }
}

export async function GET(req: Request) {
  const tenant = new URL(req.url).searchParams.get('tenant_id') || 'demo';
  try {
    return await timed(async (signal) => {
      const res = await fetch(`${BACKEND}/api/approvals?tenant_id=${encodeURIComponent(tenant)}`, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) return NextResponse.json({ backendUp: false, items: [] }, { status: 200 });
      return NextResponse.json({ backendUp: true, items: await res.json() }, { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch {
    return NextResponse.json({ backendUp: false, items: [] }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, string>;
  const { tenant_id = 'demo', id, decision } = b;
  if (!id || !decision) return NextResponse.json({ ok: false, error: 'id and decision required' }, { status: 400 });
  const verb = decision === 'reject' ? 'reject' : 'approve';
  try {
    return await timed(async (signal) => {
      const res = await fetch(`${BACKEND}/api/approvals/${encodeURIComponent(id)}/${verb}`, {
        method: 'POST', signal, cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ tenant_id, now: new Date().toISOString() }),
      });
      return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
    });
  } catch {
    return NextResponse.json({ ok: false, backendUp: false }, { status: 200 });
  }
}
