import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/rankings/overview?project_id= — rank overview (seo.view) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const project_id = searchParams.get('project_id') ?? '';
  if (!project_id) {
    return NextResponse.json({ backendUp: true, error: 'project_id is required' }, { status: 400 });
  }
  const r = await backendGet('/api/agents/seo/rank/overview', g.tenant, { project_id });
  if (!r.backendUp) return degraded({});
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
