import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pixie Lab feed proxy — same-origin bridge to the Python feed engine
 * (GET /api/feed/for-you, POST /api/feed/cards/{id}/action). Keeps the browser
 * off the FastAPI origin (no CORS) and lets the For You page degrade gracefully
 * to its mock cards when the backend is down.
 */

const BACKEND = process.env.PIXIE_BACKEND_URL || 'http://localhost:8000';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tenant = url.searchParams.get('tenant_id') || 'demo';
  const agent = url.searchParams.get('agent'); // optional → per-agent feed
  const path = agent
    ? `/api/feed/agent/${encodeURIComponent(agent)}?tenant_id=${encodeURIComponent(tenant)}`
    : `/api/feed/for-you?tenant_id=${encodeURIComponent(tenant)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${BACKEND}${path}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    clearTimeout(t);
    if (!res.ok) return NextResponse.json({ backendUp: false }, { status: 200 });
    const data = await res.json();
    return NextResponse.json({ backendUp: true, ...data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    clearTimeout(t);
    return NextResponse.json({ backendUp: false }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const card_id = body.card_id as string;
  const action_type = body.action_type as string;
  if (!card_id || !action_type) return NextResponse.json({ ok: false, error: 'card_id and action_type required' }, { status: 400 });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${BACKEND}/api/feed/cards/${encodeURIComponent(card_id)}/action`, {
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        tenant_id: (body.tenant_id as string) || 'demo',
        action_type,
        heading: (body.heading as string) || '',
        agent: (body.agent as string) || 'pixie',
        requires_confirmation: Boolean(body.requires_confirmation),
        now: new Date().toISOString(),
      }),
    });
    clearTimeout(t);
    return NextResponse.json(await res.json(), { status: res.ok ? 200 : res.status });
  } catch {
    clearTimeout(t);
    return NextResponse.json({ ok: false, backendUp: false }, { status: 200 });
  }
}
