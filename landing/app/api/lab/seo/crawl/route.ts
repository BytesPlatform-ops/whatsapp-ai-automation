import { NextResponse } from 'next/server';
import { guard, backendGet, backendForward, degraded, backendUrl, tenantHeaders } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO Crawl proxy — /api/lab/seo/crawl
 *   GET  ?site_id=  — list crawl jobs for a site (or all for tenant)  (seo.view)
 *   POST { site_id, url?, crawl_type?, requested_limit? }              start a crawl (seo.manage)
 *
 * The server clamps requested_limit to the backend max (500) and to the site's
 * configured crawl_limit — the client value is never trusted for billing.
 * The seed URL is SSRF-validated backend-side before any enqueue.
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const qs = new URL(req.url).searchParams;
  const params: Record<string, string | undefined> = {};
  const siteId = qs.get('site_id');
  if (siteId) params['site_id'] = siteId;
  const r = await backendGet('/api/agents/seo/crawls', g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json(
    { backendUp: true, ...(r.data as object) },
    { status: r.status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.site_id) {
    return NextResponse.json({ backendUp: true, error: 'site_id is required' }, { status: 400 });
  }
  const r = await backendForward('POST', '/api/agents/seo/crawl/start', g.tenant, {
    site_id: b.site_id,
    url: b.url,
    crawl_type: b.crawl_type,
    // requested_limit forwarded; backend will clamp it server-side
    requested_limit: b.requested_limit,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json(
    { backendUp: true, ...(r.data && typeof r.data === 'object' ? r.data : { data: r.data }) },
    { status: r.status },
  );
}
