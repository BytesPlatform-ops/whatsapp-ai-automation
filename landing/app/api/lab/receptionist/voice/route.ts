import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=status|numbers|calls|call|assistant (&call_id=).
 *  POST { action:'connect'|'validate'|'settings'|'outbound'|'callback'|'reconcile'|'summary'|'health'|'disconnect', ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const view = u.searchParams.get('view') || 'status';
  const callId = u.searchParams.get('call_id') || '';
  const map: Record<string, string> = {
    status: `${A}/voice/status`, numbers: `${A}/voice/numbers`, calls: `${A}/voice/calls`,
    assistant: `${A}/voice/assistant`, call: `${A}/voice/calls/${encodeURIComponent(callId)}`,
  };
  const r = await backendGet(map[view] || map.status, g.tenant, {});
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, vapi_api_key, server_secret, to, number_id, call_id, text, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const cid = String(call_id || '');
  let r;
  if (action === 'connect') r = await backendSend('POST', `${A}/voice/connect`, g.tenant, { vapi_api_key, server_secret });
  else if (action === 'validate') r = await backendSend('POST', `${A}/voice/validate`, g.tenant, {});
  else if (action === 'settings') r = await backendSend('POST', `${A}/voice/settings`, g.tenant, rest);
  else if (action === 'outbound') r = await backendSend('POST', `${A}/voice/calls/outbound`, g.tenant, { to, number_id, responding_to_request: true });
  else if (action === 'callback') r = await backendSend('POST', `${A}/voice/callbacks`, g.tenant, { to, number_id });
  else if (action === 'reconcile' && cid) r = await backendSend('POST', `${A}/voice/calls/${encodeURIComponent(cid)}/reconcile`, g.tenant, {});
  else if (action === 'summary' && cid) r = await backendSend('POST', `${A}/voice/calls/${encodeURIComponent(cid)}/summary`, g.tenant, { text });
  else if (action === 'health') r = await backendSend('POST', `${A}/voice/health`, g.tenant, {});
  else if (action === 'disconnect') r = await backendSend('POST', `${A}/voice/disconnect`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
