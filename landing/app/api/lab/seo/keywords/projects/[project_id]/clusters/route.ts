import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { project_id: string } };

/** GET  /api/lab/seo/keywords/projects/[project_id]/clusters — list clusters (seo.view)
 *  POST /api/lab/seo/keywords/projects/[project_id]/clusters — generate clusters (seo.manage) */

export async function GET(_req: Request, { params }: Params) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { project_id } = params;
  const r = await backendGet(`/api/agents/seo/keywords/projects/${encodeURIComponent(project_id)}/clusters`, g.tenant);
  if (!r.backendUp) return degraded({ clusters: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(_req: Request, { params }: Params) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const { project_id } = params;
  const r = await backendSend('POST', `/api/agents/seo/keywords/projects/${encodeURIComponent(project_id)}/clusters`, g.tenant, {});
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
