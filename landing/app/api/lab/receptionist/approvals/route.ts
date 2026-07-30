import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Receptionist approvals via the shared approvals router (agent-scoped).
 *  GET list. POST { action:'approve'|'reject', id }. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const r = await backendGet(`/api/approvals`, g.tenant);
  if (!r.backendUp) return degraded();
  const rows = Array.isArray(r.data) ? r.data : (r.data as { items?: unknown[] })?.items || [];
  const items = (rows as Record<string, unknown>[]).filter((it) => it.agent === 'ai-receptionist');
  return NextResponse.json({ backendUp: true, items }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  if (!id || (b.action !== 'approve' && b.action !== 'reject'))
    return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  const r = await backendSend('POST', `/api/approvals/${encodeURIComponent(id)}/${b.action}`, g.tenant, {});
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
