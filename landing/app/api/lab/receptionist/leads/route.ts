import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** GET leads (?status=). POST { action:'update'|'follow-up', id, ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const status = new URL(req.url).searchParams.get('status') || undefined;
  const r = await backendGet(`${A}/leads`, g.tenant, { status });
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const lid = String(id || '');
  if (!lid) return NextResponse.json({ backendUp: true, error: 'id required' }, { status: 400 });
  let r;
  if (action === 'update') r = await backendSend('PATCH', `${A}/leads/${encodeURIComponent(lid)}`, g.tenant, rest);
  else if (action === 'follow-up') r = await backendSend('POST', `${A}/leads/${encodeURIComponent(lid)}/follow-up`, g.tenant, rest);
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
