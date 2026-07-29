import { NextResponse } from 'next/server';
import { guard, backendForward } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GBP → Pixie location mapping proxy — /api/lab/seo/gbp/map-location
 *
 * Backend route (seo/local/routes.py):
 *   POST /gbp/map-location { connection_id, gbp_location_name, pixie_location_id }
 *
 * Uses backendForward so a cross-workspace attempt (backend 403
 * `{error:'cross_workspace'}`) is surfaced to the UI. Tenant is server-injected.
 */
export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const connection_id = String(b.connection_id ?? '');
  const gbp_location_name = String(b.gbp_location_name ?? '');
  const pixie_location_id = String(b.pixie_location_id ?? '');
  if (!connection_id || !gbp_location_name || !pixie_location_id) {
    return NextResponse.json(
      { backendUp: true, error: 'connection_id, gbp_location_name and pixie_location_id are required' },
      { status: 400 },
    );
  }
  const r = await backendForward('POST', `/api/agents/seo/gbp/map-location`, g.tenant, {
    connection_id, gbp_location_name, pixie_location_id,
  });
  if (!r.backendUp) {
    return NextResponse.json({ backendUp: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
