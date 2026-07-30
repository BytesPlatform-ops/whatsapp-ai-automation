import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=status|drafts. POST { action:'settings'|'sync'|'retry'|'reconcile', ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const view = new URL(req.url).searchParams.get('view') || 'status';
  const path = view === 'drafts' ? `${A}/gmail/drafts` : `${A}/gmail/status`;
  const r = await backendGet(path, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const did = String(id || '');
  let r;
  if (action === 'settings') r = await backendSend('POST', `${A}/gmail/settings`, g.tenant, rest);
  else if (action === 'sync') r = await backendSend('POST', `${A}/gmail/sync`, g.tenant, rest);
  else if (action === 'retry' && did) r = await backendSend('POST', `${A}/gmail/drafts/${encodeURIComponent(did)}/retry`, g.tenant, {});
  else if (action === 'reconcile' && did) r = await backendSend('POST', `${A}/gmail/drafts/${encodeURIComponent(did)}/reconcile`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
