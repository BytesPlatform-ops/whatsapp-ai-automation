import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, backendForward, degraded, ok } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO Sites proxy — /api/lab/seo/sites
 *   GET  — list all sites for the workspace          (seo.view)
 *   POST — create a new site                         (seo.manage)
 *
 * Tenant is resolved server-side; the client never picks it.
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/agents/seo/sites', g.tenant);
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
  const domain = String(b.domain || '').trim();
  if (domain.length < 3) {
    return NextResponse.json({ backendUp: true, error: 'A valid domain is required' }, { status: 400 });
  }
  const r = await backendForward('POST', '/api/agents/seo/sites', g.tenant, {
    domain,
    canonical_base_url: b.canonical_base_url,
    display_name: b.display_name,
    country: b.country,
    language: b.language,
    target_location: b.target_location,
    crawl_limit: b.crawl_limit,
    crawl_frequency: b.crawl_frequency,
    robots_policy: b.robots_policy,
    sitemap_urls: b.sitemap_urls,
    included_paths: b.included_paths,
    excluded_paths: b.excluded_paths,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json(
    { backendUp: true, ...(r.data && typeof r.data === 'object' ? r.data : { data: r.data }) },
    { status: r.status },
  );
}
