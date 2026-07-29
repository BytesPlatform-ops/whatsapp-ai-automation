import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Local (map-pack) competitors proxy — /api/lab/seo/local-competitors
 *
 * Distinct from /api/lab/seo/competitors (site/organic competitors); these are
 * location-scoped GBP competitors.
 *
 * Backend routes (seo/local/routes.py):
 *   GET    /locations/{location_id}/competitors        — list competitors
 *   GET    /locations/{location_id}/opportunities      — generated local opportunities
 *   POST   /locations/{location_id}/competitors        — add a competitor
 *   DELETE /competitors/{comp_id}                      — remove a competitor
 *
 * GET  ?location_id= [&view=opportunities]                (seo.view)
 * POST { location_id, business_name, ... }               (seo.manage)
 * DELETE ?comp_id=                                        (seo.manage)
 */
export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get('location_id');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const view = searchParams.get('view');
  const path = view === 'opportunities'
    ? `/api/agents/seo/locations/${encodeURIComponent(location_id)}/opportunities`
    : `/api/agents/seo/locations/${encodeURIComponent(location_id)}/competitors`;
  const r = await backendGet(path, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const location_id = String(b.location_id ?? '');
  const business_name = String(b.business_name ?? '');
  if (!location_id || !business_name) {
    return NextResponse.json({ backendUp: true, error: 'location_id and business_name are required' }, { status: 400 });
  }
  const r = await backendSend('POST', `/api/agents/seo/locations/${encodeURIComponent(location_id)}/competitors`, g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const comp_id = searchParams.get('comp_id');
  if (!comp_id) {
    return NextResponse.json({ backendUp: true, error: 'comp_id is required' }, { status: 400 });
  }
  const r = await backendSend('DELETE', `/api/agents/seo/competitors/${encodeURIComponent(comp_id)}`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
