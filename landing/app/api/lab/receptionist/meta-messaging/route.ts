import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=status|instagram-accounts|messenger-pages|drafts (&channel=).
 *  POST { action:'select'|'settings'|'test'|'health'|'disconnect'|'edit'|'retry'|'reconcile', ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const view = u.searchParams.get('view') || 'status';
  const map: Record<string, string> = {
    status: `${A}/meta-messaging/status`,
    'instagram-accounts': `${A}/meta-messaging/instagram/accounts`,
    'messenger-pages': `${A}/meta-messaging/messenger/pages`,
    drafts: `${A}/meta-messaging/drafts`,
  };
  const params: Record<string, string> = {};
  const channel = u.searchParams.get('channel');
  if (view === 'drafts' && channel) params.channel = channel;
  const r = await backendGet(map[view] || map.status, g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, channel, asset_id, reply_mode, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const did = String(id || '');
  let r;
  if (action === 'select') r = await backendSend('POST', `${A}/meta-messaging/select`, g.tenant, { channel, asset_id });
  else if (action === 'settings') r = await backendSend('POST', `${A}/meta-messaging/settings`, g.tenant, { channel, reply_mode });
  else if (action === 'test') r = await backendSend('POST', `${A}/meta-messaging/test`, g.tenant, {});
  else if (action === 'health') r = await backendSend('POST', `${A}/meta-messaging/health`, g.tenant, {});
  else if (action === 'disconnect') r = await backendSend('POST', `${A}/meta-messaging/disconnect`, g.tenant, { channel });
  else if (action === 'edit' && did) r = await backendSend('POST', `${A}/meta-messaging/drafts/${encodeURIComponent(did)}/edit`, g.tenant, rest);
  else if (action === 'retry' && did) r = await backendSend('POST', `${A}/meta-messaging/drafts/${encodeURIComponent(did)}/retry`, g.tenant, {});
  else if (action === 'reconcile' && did) r = await backendSend('POST', `${A}/meta-messaging/drafts/${encodeURIComponent(did)}/reconcile`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
