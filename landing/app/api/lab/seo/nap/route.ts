import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * NAP (Name / Address / Phone) audit proxy — /api/lab/seo/nap
 *
 * Backend routes (seo/local/routes.py):
 *   GET  /locations/{location_id}/nap             — current NAP consistency summary
 *   POST /locations/{location_id}/nap/audit       — (re)run the NAP audit
 *   POST /nap/{audit_id}/confirm-variant          — confirm an intended NAP variation
 *
 * GET  ?location_id= — summary (seo.view)
 * POST { action:'audit', location_id }                       — run audit (seo.manage)
 * POST { action:'confirm_variant', audit_id, confirmed_by }  — confirm variant (seo.manage)
 */
export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get('location_id');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const r = await backendGet(`/api/agents/seo/locations/${encodeURIComponent(location_id)}/nap`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? 'audit');

  if (action === 'confirm_variant') {
    const audit_id = String(b.audit_id ?? '');
    if (!audit_id) {
      return NextResponse.json({ backendUp: true, error: 'audit_id is required' }, { status: 400 });
    }
    const r = await backendSend('POST', `/api/agents/seo/nap/${encodeURIComponent(audit_id)}/confirm-variant`, g.tenant, {
      confirmed_by: b.confirmed_by ?? '',
    });
    if (!r.backendUp) return degraded();
    return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // default: run audit
  const location_id = String(b.location_id ?? '');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const r = await backendSend('POST', `/api/agents/seo/locations/${encodeURIComponent(location_id)}/nap/audit`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
