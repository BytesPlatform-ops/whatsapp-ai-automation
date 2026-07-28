import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Local rank proxy — /api/lab/seo/local-rank
 *
 * Backend routes (seo/local/routes.py):
 *   GET  /locations/{location_id}/local-rank/overview    — rank overview
 *   POST /local-rank/check                               — trigger a rank check
 *
 * GET  ?location_id= — rank overview for a location (seo.view)
 * POST { location_id, keywords, city?, device? } — trigger rank check (seo.manage)
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const location_id = new URL(req.url).searchParams.get('location_id');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const r = await backendGet(`/api/agents/seo/locations/${encodeURIComponent(location_id)}/local-rank/overview`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/local-rank/check', g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
