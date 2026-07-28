import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ project_id: string }> };

/**
 * GET  /api/lab/seo/keywords/projects/[project_id]/clusters — list clusters (seo.view)
 * POST /api/lab/seo/keywords/projects/[project_id]/clusters — auto-cluster keywords (seo.manage)
 *
 * Backend routes (seo/keywords/project_routes.py):
 *   GET  /keywords/projects/{project_id}/clusters
 *   POST /keywords/projects/{project_id}/clusters/auto   ← note /auto suffix
 */

export async function GET(_req: Request, { params }: Params) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { project_id } = await params;
  const r = await backendGet(`/api/agents/seo/keywords/projects/${encodeURIComponent(project_id)}/clusters`, g.tenant);
  if (!r.backendUp) return degraded({ clusters: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, { params }: Params) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const { project_id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendSend('POST', `/api/agents/seo/keywords/projects/${encodeURIComponent(project_id)}/clusters/auto`, g.tenant, {
    ai_assist: b.ai_assist ?? false,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
