import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GBP OAuth start proxy — /api/lab/seo/gbp/connect
 *
 * Backend route (seo/local/routes.py):
 *   GET /gbp/connect — begins the Google Business Profile OAuth handshake and
 *   returns the authorize URL + state to redirect the browser to.
 *
 * Starting an OAuth connection is a management action, so it requires seo.manage.
 */
export async function GET() {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const r = await backendGet(`/api/agents/seo/gbp/connect`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
