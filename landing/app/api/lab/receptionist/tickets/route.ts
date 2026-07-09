import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** GET tickets, or ?resource=escalations for escalations.
 *  POST { action:'update', id, ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const resource = new URL(req.url).searchParams.get('resource');
  const path = resource === 'escalations' ? `${A}/escalations` : `${A}/tickets`;
  const r = await backendGet(path, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, resource, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tid = String(id || '');
  if (action !== 'update' || !tid) return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  const path = resource === 'escalations' ? `${A}/escalations/${encodeURIComponent(tid)}` : `${A}/tickets/${encodeURIComponent(tid)}`;
  const r = await backendSend('PATCH', path, g.tenant, rest);
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
