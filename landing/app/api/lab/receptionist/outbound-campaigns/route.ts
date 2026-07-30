import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=list|detail|audience|recipients|analytics|validate (&id=).
 *  POST { action:'create'|'update'|'add-step'|'set-content'|'request-approval'|'approve'|'reject'|'schedule'|'start'|'pause'|'resume'|'cancel'|'archive', id?, ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const view = u.searchParams.get('view') || 'list';
  const id = u.searchParams.get('id') || '';
  let path: string;
  if (view === 'detail') path = `${A}/outbound-campaigns/${encodeURIComponent(id)}`;
  else if (view === 'audience') path = `${A}/outbound-campaigns/${encodeURIComponent(id)}/audience`;
  else if (view === 'recipients') path = `${A}/outbound-campaigns/${encodeURIComponent(id)}/recipients`;
  else if (view === 'analytics') path = `${A}/outbound-campaigns/${encodeURIComponent(id)}/analytics`;
  else if (view === 'validate') path = `${A}/outbound-campaigns/${encodeURIComponent(id)}/validate`;
  else path = `${A}/outbound-campaigns`;
  const r = await backendGet(path, g.tenant, {});
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || '');
  const id = String(b.id || '');
  let r;
  if (action === 'create') r = await backendSend('POST', `${A}/outbound-campaigns`, g.tenant, { name: b.name, purpose: b.purpose, channels: b.channels });
  else if (action === 'update' && id) r = await backendSend('POST', `${A}/outbound-campaigns/${encodeURIComponent(id)}/update`, g.tenant, (b.patch as Record<string, unknown>) || {});
  else if (action === 'add-step' && id) r = await backendSend('POST', `${A}/outbound-campaigns/${encodeURIComponent(id)}/steps`, g.tenant, (b.step as Record<string, unknown>) || {});
  else if (action === 'set-content' && id) r = await backendSend('POST', `${A}/outbound-campaigns/${encodeURIComponent(id)}/content`, g.tenant, (b.content as Record<string, unknown>) || {});
  else if (id && ['request-approval', 'approve', 'reject', 'schedule', 'start', 'pause', 'resume', 'cancel', 'archive'].includes(action)) {
    r = await backendSend('POST', `${A}/outbound-campaigns/${encodeURIComponent(id)}/${action}`, g.tenant, { notes: b.notes, schedule: b.schedule });
  } else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
