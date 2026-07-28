import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/optimise?site_id=&page_id=&keyword= — on-page recommendations (seo.view) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const params: Record<string, string> = {};
  const site_id = searchParams.get('site_id');
  const page_id = searchParams.get('page_id');
  const keyword = searchParams.get('keyword');
  const url = searchParams.get('url');
  if (site_id) params.site_id = site_id;
  if (page_id) params.page_id = page_id;
  if (keyword) params.keyword = keyword;
  if (url) params.url = url;
  const r = await backendGet('/api/agents/seo/optimise', g.tenant, params);
  if (!r.backendUp) return degraded({});
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
