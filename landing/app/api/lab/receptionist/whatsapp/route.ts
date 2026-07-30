import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=status|wabas|phone-numbers|templates|drafts (&waba_id=).
 *  POST { action:'settings'|'sync'|'edit'|'retry'|'reconcile', id?, ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const view = u.searchParams.get('view') || 'status';
  const map: Record<string, string> = {
    status: `${A}/whatsapp/status`, wabas: `${A}/whatsapp/wabas`,
    'phone-numbers': `${A}/whatsapp/phone-numbers`, templates: `${A}/whatsapp/templates`,
    drafts: `${A}/whatsapp/drafts`,
  };
  const params: Record<string, string> = {};
  const waba = u.searchParams.get('waba_id');
  if (view === 'phone-numbers' && waba) params.waba_id = waba;
  const r = await backendGet(map[view] || map.status, g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const did = String(id || '');
  let r;
  if (action === 'settings') r = await backendSend('POST', `${A}/whatsapp/settings`, g.tenant, rest);
  else if (action === 'sync') r = await backendSend('POST', `${A}/whatsapp/templates/sync`, g.tenant, {});
  else if (action === 'edit' && did) r = await backendSend('POST', `${A}/whatsapp/drafts/${encodeURIComponent(did)}/edit`, g.tenant, rest);
  else if (action === 'retry' && did) r = await backendSend('POST', `${A}/whatsapp/drafts/${encodeURIComponent(did)}/retry`, g.tenant, {});
  else if (action === 'reconcile' && did) r = await backendSend('POST', `${A}/whatsapp/drafts/${encodeURIComponent(did)}/reconcile`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
