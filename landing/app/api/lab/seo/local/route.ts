import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Local SEO overview proxy — /api/lab/seo/local
 *
 * The backend has no flat /local overview endpoint. We derive an overview by
 * listing locations (GET /locations) and returning the collection as "overview".
 * This is the closest available backend endpoint for a summary of local SEO data.
 *
 * Backend route (seo/local/routes.py):
 *   GET /locations?site_id=&include_archived=
 *
 * GET — returns locations list as overview (seo.view)
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const site_id = new URL(req.url).searchParams.get('site_id');
  const r = await backendGet('/api/agents/seo/locations', g.tenant, site_id ? { site_id } : undefined);
  if (!r.backendUp) return degraded();
  // Re-shape to { overview: { locations } } to keep the client shape stable
  const data = (r.data as Record<string, unknown>) ?? {};
  return NextResponse.json({ backendUp: true, overview: data }, { headers: { 'Cache-Control': 'no-store' } });
}
