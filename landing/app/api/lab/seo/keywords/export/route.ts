import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Keywords CSV export proxy — /api/lab/seo/keywords/export?project_id=
 *
 * Backend route (seo/keywords/project_routes.py):
 *   GET /keywords/projects/{project_id}/keywords/export
 */
export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const project_id = searchParams.get('project_id') ?? '';
  if (!project_id) {
    return NextResponse.json({ backendUp: true, error: 'project_id is required' }, { status: 400 });
  }
  const r = await backendGet(`/api/agents/seo/keywords/projects/${encodeURIComponent(project_id)}/keywords/export`, g.tenant);
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
