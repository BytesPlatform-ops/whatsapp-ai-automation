import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/pagespeed?page_id=|url=|site_id= — Core Web Vitals for a page (seo.view) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const params: Record<string, string> = {};
  const page_id = searchParams.get('page_id');
  const url = searchParams.get('url');
  const site_id = searchParams.get('site_id');
  if (page_id) params.page_id = page_id;
  if (url) params.url = url;
  if (site_id) params.site_id = site_id;
  if (!page_id && !url && !site_id) {
    return NextResponse.json({ backendUp: true, error: 'page_id, url, or site_id is required' }, { status: 400 });
  }
  const r = await backendGet('/api/agents/seo/pagespeed', g.tenant, params);
  if (!r.backendUp) return degraded({});
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
