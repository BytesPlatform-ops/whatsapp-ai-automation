import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/rankings/jobs?project_id= — list rank-check jobs (seo.view) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const project_id = searchParams.get('project_id') ?? undefined;
  const r = await backendGet('/api/agents/seo/rank/jobs', g.tenant, project_id ? { project_id } : undefined);
  if (!r.backendUp) return degraded({ jobs: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
