import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GBP profile sync proxy — /api/lab/seo/gbp/sync
 *
 * Backend route (seo/local/routes.py):
 *   POST /gbp/sync { connection_id, location_id } — pull the latest profile
 *   fields + reviews for a mapped location.
 */
export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const connection_id = String(b.connection_id ?? '');
  const location_id = String(b.location_id ?? '');
  if (!connection_id || !location_id) {
    return NextResponse.json({ backendUp: true, error: 'connection_id and location_id are required' }, { status: 400 });
  }
  const r = await backendSend('POST', `/api/agents/seo/gbp/sync`, g.tenant, { connection_id, location_id });
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
