import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/lab/seo/keywords?project_id= — list keywords (seo.view)
 * POST /api/lab/seo/keywords             — add a keyword   (seo.manage)
 *
 * Backend routes (seo/keywords/project_routes.py):
 *   GET  /keywords/projects/{project_id}/keywords
 *   POST /keywords/projects/{project_id}/keywords
 *
 * project_id is required and becomes a path segment (not a query param).
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const project_id = searchParams.get('project_id') ?? '';
  if (!project_id) {
    return NextResponse.json({ backendUp: true, error: 'project_id is required' }, { status: 400 });
  }
  const params: Record<string, string> = {};
  const intent = searchParams.get('intent');
  const tracking_status = searchParams.get('tracking_status');
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');
  if (intent) params.intent = intent;
  if (tracking_status) params.tracking_status = tracking_status;
  if (tag) params.tag = tag;
  if (search) params.search = search;
  const r = await backendGet(
    `/api/agents/seo/keywords/projects/${encodeURIComponent(project_id)}/keywords`,
    g.tenant,
    Object.keys(params).length ? params : undefined,
  );
  if (!r.backendUp) return degraded({ keywords: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const project_id = String(b.project_id ?? '');
  if (!project_id) {
    return NextResponse.json({ backendUp: true, error: 'project_id is required' }, { status: 400 });
  }
  const r = await backendSend('POST', `/api/agents/seo/keywords/projects/${encodeURIComponent(project_id)}/keywords`, g.tenant, b);
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
