import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GBP connections list proxy — /api/lab/seo/gbp/connections
 *
 * Backend route (seo/local/routes.py):
 *   GET /gbp/connections — list this workspace's connected Google Business
 *   Profile accounts. The backend returns only redacted connection dicts
 *   (`_safe_connection_dict` strips tokens), so nothing sensitive is forwarded.
 */
export async function GET() {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const r = await backendGet(`/api/agents/seo/gbp/connections`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
