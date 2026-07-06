import { NextResponse } from 'next/server';
import { resolveCaller, BACKEND } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pixie Lab feed proxy → Python feed engine (GET /api/feed/for-you |
 * /api/feed/agent/{agent}, POST /api/feed/cards/{id}/action). The tenant is
 * resolved SERVER-SIDE (workspace-scoped) — a client-supplied tenant_id is
 * ignored — so the feed can't be read or mutated for another workspace. Degrades
 * to the page's mock cards when the backend is down or the caller isn't signed in.
 */

export async function GET(req: Request) {
  const caller = await resolveCaller();
  if (!caller) return NextResponse.json({ backendUp: false }, { status: 200 });
  const agent = new URL(req.url).searchParams.get('agent');
  const path = agent
    ? `/api/feed/agent/${encodeURIComponent(agent)}?tenant_id=${encodeURIComponent(caller.tenant)}`
    : `/api/feed/for-you?tenant_id=${encodeURIComponent(caller.tenant)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${BACKEND}${path}`, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
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
  const caller = await resolveCaller();
  if (!caller) return NextResponse.json({ ok: false, backendUp: false }, { status: 200 });
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
        tenant_id: caller.tenant, // server-resolved; never the client's value
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
