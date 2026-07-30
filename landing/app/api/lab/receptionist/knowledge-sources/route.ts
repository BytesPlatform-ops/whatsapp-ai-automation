import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET list. POST { action:'text'|'website'|'reindex'|'archive'|'delete', ... }. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const r = await backendGet(`${A}/knowledge-sources`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sid = String(id || '');
  let r;
  if (action === 'text') r = await backendSend('POST', `${A}/knowledge-sources/text`, g.tenant, rest);
  else if (action === 'website') r = await backendSend('POST', `${A}/knowledge-sources/website`, g.tenant, rest);
  else if (action === 'reindex' && sid) r = await backendSend('POST', `${A}/knowledge-sources/${encodeURIComponent(sid)}/reindex`, g.tenant, {});
  else if (action === 'archive' && sid) r = await backendSend('POST', `${A}/knowledge-sources/${encodeURIComponent(sid)}/archive`, g.tenant, {});
  else if (action === 'delete' && sid) r = await backendSend('DELETE', `${A}/knowledge-sources/${encodeURIComponent(sid)}`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
