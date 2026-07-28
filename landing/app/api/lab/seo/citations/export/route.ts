import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Citations CSV export proxy — /api/lab/seo/citations/export
 *
 * Backend route (seo/local/routes.py):
 *   GET /locations/{location_id}/citations/export
 *
 * ?location_id= required (seo.view)
 */
export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const location_id = new URL(req.url).searchParams.get('location_id');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const r = await backendGet(`/api/agents/seo/locations/${encodeURIComponent(location_id)}/citations/export`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
