import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=health|jobs (&status=). POST { action:'retry'|'cancel', id }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const view = u.searchParams.get('view') || 'health';
  const path = view === 'jobs'
    ? `${A}/worker/jobs`
    : `${A}/worker/health`;
  const status = u.searchParams.get('status') || undefined;
  const r = await backendGet(path, g.tenant, status ? { status } : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  if (!id || (b.action !== 'retry' && b.action !== 'cancel'))
    return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  const r = await backendSend('POST', `${A}/worker/jobs/${encodeURIComponent(id)}/${b.action}`, g.tenant, {});
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
