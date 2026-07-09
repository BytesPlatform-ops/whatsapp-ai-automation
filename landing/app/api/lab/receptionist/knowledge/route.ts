import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** GET knowledge items. POST { action:'create'|'update'|'delete', id?, ... }. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const r = await backendGet(`${A}/knowledge`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kid = String(id || '');
  let r;
  if (action === 'create') r = await backendSend('POST', `${A}/knowledge`, g.tenant, rest);
  else if (action === 'update' && kid) r = await backendSend('PATCH', `${A}/knowledge/${encodeURIComponent(kid)}`, g.tenant, rest);
  else if (action === 'delete' && kid) r = await backendSend('DELETE', `${A}/knowledge/${encodeURIComponent(kid)}`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
