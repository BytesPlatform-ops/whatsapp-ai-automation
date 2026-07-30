import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=status|list|availability|bookings (&service=&days=&status=).
 *  POST { action:'config'|'reschedule'|'cancel'|'reconcile', id?, ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const view = u.searchParams.get('view') || 'status';
  let path = `${A}/calendar/status`;
  const params: Record<string, string> = {};
  if (view === 'list') path = `${A}/calendar/list`;
  else if (view === 'availability') { path = `${A}/calendar/availability`; params.service = u.searchParams.get('service') || ''; params.days = u.searchParams.get('days') || '7'; }
  else if (view === 'bookings') { path = `${A}/calendar/bookings`; const s = u.searchParams.get('status'); if (s) params.status = s; }
  const r = await backendGet(path, g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, id, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const bid = String(id || '');
  let r;
  if (action === 'config') r = await backendSend('POST', `${A}/calendar/config`, g.tenant, rest);
  else if (action === 'reschedule' && bid) r = await backendSend('POST', `${A}/calendar/bookings/${encodeURIComponent(bid)}/reschedule`, g.tenant, rest);
  else if (action === 'cancel' && bid) r = await backendSend('POST', `${A}/calendar/bookings/${encodeURIComponent(bid)}/cancel`, g.tenant, {});
  else if (action === 'reconcile' && bid) r = await backendSend('POST', `${A}/calendar/bookings/${encodeURIComponent(bid)}/reconcile`, g.tenant, {});
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
