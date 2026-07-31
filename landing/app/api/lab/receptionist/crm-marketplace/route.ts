import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=catalog|status|conflicts|analytics (&provider=).
 *  POST { action:'connect'|'capabilities'|'objects'|'sync-direction'|'import'|'sync'|'resolve-conflict'|'pause'|'resume'|'health'|'disconnect', provider, ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const view = u.searchParams.get('view') || 'catalog';
  const provider = u.searchParams.get('provider') || '';
  let path: string;
  if (view === 'status') path = `${A}/crm/${encodeURIComponent(provider)}/status`;
  else if (view === 'conflicts') path = `${A}/crm/${encodeURIComponent(provider)}/conflicts`;
  else if (view === 'analytics') path = `${A}/crm/${encodeURIComponent(provider)}/analytics`;
  else path = `${A}/crm/catalog`;
  const r = await backendGet(path, g.tenant, {});
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || '');
  const provider = String(b.provider || '');
  if (!provider) return NextResponse.json({ backendUp: true, error: 'provider required' }, { status: 400 });
  const P = `${A}/crm/${encodeURIComponent(provider)}`;
  let r;
  if (action === 'connect') r = await backendSend('POST', `${P}/connect`, g.tenant, { access_token: b.access_token, api_key: b.api_key, account_id: b.account_id });
  else if (action === 'capabilities') r = await backendGet(`${P}/capabilities`, g.tenant, {});
  else if (action === 'objects') r = await backendSend('POST', `${P}/objects`, g.tenant, { objects: b.objects });
  else if (action === 'sync-direction') r = await backendSend('POST', `${P}/sync-direction`, g.tenant, { direction: b.direction });
  else if (action === 'import') r = await backendSend('POST', `${P}/import`, g.tenant, { object_type: b.object_type });
  else if (action === 'sync') r = await backendSend('POST', `${P}/sync`, g.tenant, {});
  else if (action === 'resolve-conflict') r = await backendSend('POST', `${P}/conflicts/resolve`, g.tenant, { conflict_id: b.conflict_id, resolution: b.resolution });
  else if (['pause', 'resume', 'health', 'disconnect'].includes(action)) r = await backendSend('POST', `${P}/${action}`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
