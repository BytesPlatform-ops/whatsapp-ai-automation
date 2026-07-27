import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO Reports proxy — /api/lab/seo/reports
 *   GET ?site_id=        — latest report for a site (or all reports for tenant)
 *   GET ?crawl_job_id=   — report for a specific crawl job
 *
 * Both require seo.view permission.
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const qs = new URL(req.url).searchParams;
  const crawlJobId = qs.get('crawl_job_id');
  const siteId = qs.get('site_id');

  if (crawlJobId) {
    // Route to /report/{crawl_job_id} on the backend
    const r = await backendGet(
      `/api/agents/seo/report/${encodeURIComponent(crawlJobId)}`,
      g.tenant,
    );
    if (!r.backendUp) return degraded();
    return NextResponse.json(
      { backendUp: true, ...(r.data as object) },
      { status: r.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // site_id or no filter → /reports?site_id=
  const params: Record<string, string | undefined> = {};
  if (siteId) params['site_id'] = siteId;
  const r = await backendGet('/api/agents/seo/reports', g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json(
    { backendUp: true, ...(r.data as object) },
    { status: r.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
