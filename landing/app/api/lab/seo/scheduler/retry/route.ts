import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Backend route (seo/scheduler/routes.py):
 *   POST /api/agents/seo/scheduler/jobs/{job_id}/retry
 *   Body: { source?, tenant_id? }
 *
 * The job_id is a path param, not in the body.
 */
export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const job_id = String(b.job_id ?? '');
  if (!job_id) return NextResponse.json({ backendUp: true, error: 'job_id required' }, { status: 400 });
  const r = await backendSend('POST', `/api/agents/seo/scheduler/jobs/${encodeURIComponent(job_id)}/retry`, g.tenant, {
    source: b.source,
  });
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
