import { NextResponse } from 'next/server';
import { guard, backendGet, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Location-page opportunities proxy — /api/lab/seo/location-pages
 *
 * Backend routes (seo/local/routes.py):
 *   GET  /locations/{location_id}/page-opportunities  — suggested city/service pages
 *   POST /location-pages/handoff                       — hand a page brief to Content Agent
 *
 * GET  ?location_id=                                                     (seo.view)
 * POST { action:'handoff', location_id, target_city, primary_keyword }  (seo.manage)
 *
 * The Content-Agent handoff is billed as a separate Content operation on the
 * backend; this proxy only forwards it.
 */
export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get('location_id');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const r = await backendGet(`/api/agents/seo/locations/${encodeURIComponent(location_id)}/page-opportunities`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const location_id = String(b.location_id ?? '');
  const target_city = String(b.target_city ?? '');
  const primary_keyword = String(b.primary_keyword ?? '');
  if (!location_id || !target_city || !primary_keyword) {
    return NextResponse.json(
      { backendUp: true, error: 'location_id, target_city and primary_keyword are required' },
      { status: 400 },
    );
  }
  const r = await backendForward('POST', `/api/agents/seo/location-pages/handoff`, g.tenant, b);
  if (!r.backendUp) {
    return NextResponse.json({ backendUp: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
