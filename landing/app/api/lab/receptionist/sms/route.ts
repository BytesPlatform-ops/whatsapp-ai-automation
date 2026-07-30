import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=status|numbers|drafts.
 *  POST { action:'select'|'settings'|'quiet-hours'|'test'|'health'|'disconnect'|'edit'|'retry'|'reconcile', ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const view = u.searchParams.get('view') || 'status';
  const map: Record<string, string> = {
    status: `${A}/sms/status`, numbers: `${A}/sms/numbers`, drafts: `${A}/sms/drafts`,
  };
  const r = await backendGet(map[view] || map.status, g.tenant, {});
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, sender_number, sms_reply_mode, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const did = String(id || '');
  let r;
  if (action === 'select') r = await backendSend('POST', `${A}/sms/select`, g.tenant, { sender_number });
  else if (action === 'settings') r = await backendSend('POST', `${A}/sms/settings`, g.tenant, { sms_reply_mode });
  else if (action === 'quiet-hours') r = await backendSend('POST', `${A}/sms/quiet-hours`, g.tenant, rest);
  else if (action === 'test') r = await backendSend('POST', `${A}/sms/test`, g.tenant, {});
  else if (action === 'health') r = await backendSend('POST', `${A}/sms/health`, g.tenant, {});
  else if (action === 'disconnect') r = await backendSend('POST', `${A}/sms/disconnect`, g.tenant, {});
  else if (action === 'edit' && did) r = await backendSend('POST', `${A}/sms/drafts/${encodeURIComponent(did)}/edit`, g.tenant, rest);
  else if (action === 'retry' && did) r = await backendSend('POST', `${A}/sms/drafts/${encodeURIComponent(did)}/retry`, g.tenant, {});
  else if (action === 'reconcile' && did) r = await backendSend('POST', `${A}/sms/drafts/${encodeURIComponent(did)}/reconcile`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
