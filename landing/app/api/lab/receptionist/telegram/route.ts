import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=status|drafts|webhook-info (&mode=).
 *  POST { action:'connect'|'validate'|'webhook'|'webhook-remove'|'mode'|'settings'|'test'|'health'|'disconnect'|'edit'|'retry'|'reconcile', ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const view = u.searchParams.get('view') || 'status';
  const map: Record<string, string> = {
    status: `${A}/telegram/status`, drafts: `${A}/telegram/drafts`,
    'webhook-info': `${A}/telegram/webhook-info`,
  };
  const params: Record<string, string> = {};
  const mode = u.searchParams.get('mode');
  if (view === 'drafts' && mode) params.mode = mode;
  const r = await backendGet(map[view] || map.status, g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, bot_token, mode, reply_mode, standard, business, rotate_secret, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const did = String(id || '');
  let r;
  if (action === 'connect') r = await backendSend('POST', `${A}/telegram/connect`, g.tenant, { bot_token });
  else if (action === 'validate') r = await backendSend('POST', `${A}/telegram/validate`, g.tenant, {});
  else if (action === 'webhook') r = await backendSend('POST', `${A}/telegram/webhook`, g.tenant, { rotate_secret });
  else if (action === 'webhook-remove') r = await backendSend('POST', `${A}/telegram/webhook/remove`, g.tenant, {});
  else if (action === 'mode') r = await backendSend('POST', `${A}/telegram/mode`, g.tenant, { standard, business });
  else if (action === 'settings') r = await backendSend('POST', `${A}/telegram/settings`, g.tenant, { mode, reply_mode });
  else if (action === 'test') r = await backendSend('POST', `${A}/telegram/test`, g.tenant, {});
  else if (action === 'health') r = await backendSend('POST', `${A}/telegram/health`, g.tenant, {});
  else if (action === 'disconnect') r = await backendSend('POST', `${A}/telegram/disconnect`, g.tenant, {});
  else if (action === 'edit' && did) r = await backendSend('POST', `${A}/telegram/drafts/${encodeURIComponent(did)}/edit`, g.tenant, rest);
  else if (action === 'retry' && did) r = await backendSend('POST', `${A}/telegram/drafts/${encodeURIComponent(did)}/retry`, g.tenant, {});
  else if (action === 'reconcile' && did) r = await backendSend('POST', `${A}/telegram/drafts/${encodeURIComponent(did)}/reconcile`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
