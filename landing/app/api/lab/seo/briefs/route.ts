import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET  /api/lab/seo/briefs?site_id=&project_id= — list briefs (seo.view)
 *  POST /api/lab/seo/briefs                      — create a brief (seo.manage) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const params: Record<string, string> = {};
  const site_id = searchParams.get('site_id');
  const project_id = searchParams.get('project_id');
  if (site_id) params.site_id = site_id;
  if (project_id) params.project_id = project_id;
  const r = await backendGet('/api/agents/seo/briefs', g.tenant, Object.keys(params).length ? params : undefined);
  if (!r.backendUp) return degraded({ briefs: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.keyword) {
    return NextResponse.json({ backendUp: true, error: 'keyword is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/briefs', g.tenant, {
    keyword: b.keyword,
    site_id: b.site_id,
    project_id: b.project_id,
    title: b.title,
    notes: b.notes,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
