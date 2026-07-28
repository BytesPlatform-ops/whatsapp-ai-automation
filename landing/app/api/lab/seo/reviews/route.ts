import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reviews proxy — /api/lab/seo/reviews
 *
 * Backend routes (seo/local/routes.py):
 *   GET  /locations/{location_id}/reviews           — list reviews
 *   POST /reviews/{review_id}/draft                 — AI-draft a reply
 *   PATCH /reviews/{review_id}/draft                — edit a drafted reply
 *   POST /reviews/{review_id}/approve               — approve a drafted reply
 *   POST /reviews/{review_id}/handled               — mark as handled
 *
 * GET  ?location_id= — list reviews for a location (seo.view)
 * POST { action: 'draft'|'approve'|'handled', review_id, ... } (seo.manage)
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
  for (const [k, v] of searchParams.entries()) { if (k !== 'tenant_id' && k !== 'location_id') params[k] = v; }
  const r = await backendGet(`/api/agents/seo/locations/${encodeURIComponent(location_id)}/reviews`, g.tenant, Object.keys(params).length ? params : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? 'draft');
  const review_id = String(b.review_id ?? '');
  if (!review_id) {
    return NextResponse.json({ backendUp: true, error: 'review_id is required' }, { status: 400 });
  }
  let path: string;
  if (action === 'approve') {
    path = `/api/agents/seo/reviews/${encodeURIComponent(review_id)}/approve`;
  } else if (action === 'handled') {
    path = `/api/agents/seo/reviews/${encodeURIComponent(review_id)}/handled`;
  } else {
    // default: draft
    path = `/api/agents/seo/reviews/${encodeURIComponent(review_id)}/draft`;
  }
  const r = await backendSend('POST', path, g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
