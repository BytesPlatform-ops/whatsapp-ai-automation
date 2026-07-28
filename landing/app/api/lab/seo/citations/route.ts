import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Citations proxy — /api/lab/seo/citations
 *
 * Backend routes (seo/local/routes.py):
 *   GET  /locations/{location_id}/citations         — list citations
 *   POST /locations/{location_id}/citations         — add a citation
 *   POST /locations/{location_id}/citations/check-all — check all citations
 *
 * GET  ?location_id= — list citations for a location (seo.view)
 * POST { action: 'import'|'check_consistency', location_id, ... } (seo.manage)
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get('location_id');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const params: Record<string, string> = {};
  const status = searchParams.get('status');
  if (status) params.status = status;
  const r = await backendGet(`/api/agents/seo/locations/${encodeURIComponent(location_id)}/citations`, g.tenant, Object.keys(params).length ? params : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? 'import');
  const location_id = String(b.location_id ?? '');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  // check_consistency → POST /locations/{id}/citations/check-all
  // import / add     → POST /locations/{id}/citations
  const path = action === 'check_consistency'
    ? `/api/agents/seo/locations/${encodeURIComponent(location_id)}/citations/check-all`
    : `/api/agents/seo/locations/${encodeURIComponent(location_id)}/citations`;
  const r = await backendSend('POST', path, g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
