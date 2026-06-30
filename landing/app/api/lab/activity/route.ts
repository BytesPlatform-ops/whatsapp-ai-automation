import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Activity proxy — same-origin bridge to the Python activity log. */
const BACKEND = process.env.PIXIE_BACKEND_URL || 'http://localhost:8000';

export async function GET(req: Request) {
  const tenant = new URL(req.url).searchParams.get('tenant_id') || 'demo';
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 2500);
  try {
    const res = await fetch(`${BACKEND}/api/activity?tenant_id=${encodeURIComponent(tenant)}&limit=30`, { signal: c.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) return NextResponse.json({ backendUp: false, events: [] }, { status: 200 });
    return NextResponse.json({ backendUp: true, events: await res.json() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    clearTimeout(t);
    return NextResponse.json({ backendUp: false, events: [] }, { status: 200 });
  }
}
