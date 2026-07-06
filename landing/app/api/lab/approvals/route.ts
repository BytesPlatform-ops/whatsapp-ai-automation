import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Approvals proxy → Python approvals service. Tenant is resolved SERVER-SIDE
 * (workspace-scoped) so the queue only ever shows this workspace's pending
 * actions — shared by SEO one-tap fixes and Meta post/reply prepares.
 *   GET                                          pending + recent approvals (approvals.view)
 *   POST { id, decision:'approve'|'reject'|'skip' }  resolve one            (approvals.manage)
 *   POST { id, decision:'edit', prepared_output?, preview? }  tweak before approve
 */

export async function GET() {
  const g = await guard('approvals.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/approvals', g.tenant);
  if (!r.backendUp) return degraded({ items: [] });
  return NextResponse.json({ backendUp: true, items: r.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('approvals.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  const decision = String(b.decision || '');
  if (!id || !decision) return NextResponse.json({ backendUp: true, error: 'id and decision required' }, { status: 400 });

  const verb = decision === 'reject' ? 'reject' : decision === 'skip' ? 'skip' : decision === 'edit' ? 'edit' : 'approve';
  const body = verb === 'edit' ? { prepared_output: b.prepared_output || {}, preview: b.preview || '' } : {};
  const r = await backendSend('POST', `/api/approvals/${encodeURIComponent(id)}/${verb}`, g.tenant, body);
  if (!r.backendUp) return degraded({ ok: false });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
