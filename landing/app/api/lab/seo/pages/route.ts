import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO Pages proxy — /api/lab/seo/pages
 *   GET ?crawl_job_id=&limit=&offset=   (seo.view)
 *
 * Returns paginated crawled-page summaries for a crawl job.
 * The crawl_job_id is required (validated here before forwarding to the backend).
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const qs = new URL(req.url).searchParams;
  const crawlJobId = qs.get('crawl_job_id');
  if (!crawlJobId) {
    return NextResponse.json({ backendUp: true, error: 'crawl_job_id is required' }, { status: 400 });
  }
  const limit = qs.get('limit') || '100';
  const offset = qs.get('offset') || '0';
  const r = await backendGet('/api/agents/seo/pages', g.tenant, {
    crawl_job_id: crawlJobId,
    limit,
    offset,
  });
  if (!r.backendUp) return degraded();
  return NextResponse.json(
    { backendUp: true, ...(r.data as object) },
    { status: r.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
