import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO Issues proxy — /api/lab/seo/issues
 *   GET ?crawl_job_id=&site_id=&severity=&status=&category=    (seo.view)
 *
 * At least one of crawl_job_id or site_id should be provided; without either
 * the backend returns all issues for the tenant.
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const qs = new URL(req.url).searchParams;

  const params: Record<string, string | undefined> = {};
  const crawlJobId = qs.get('crawl_job_id');
  const siteId = qs.get('site_id');
  const severity = qs.get('severity');
  const status = qs.get('status');
  const category = qs.get('category');
  if (crawlJobId) params['crawl_job_id'] = crawlJobId;
  if (siteId) params['site_id'] = siteId;
  if (severity) params['severity'] = severity;
  if (status) params['status'] = status;
  if (category) params['category'] = category;

  const r = await backendGet('/api/agents/seo/issues', g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json(
    { backendUp: true, ...(r.data as object) },
    { status: r.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
