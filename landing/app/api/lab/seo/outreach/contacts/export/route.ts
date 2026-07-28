import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Outreach contacts CSV export — /api/lab/seo/outreach/contacts/export
 *
 * Backend route (seo/outreach/routes.py):
 *   GET /outreach/contacts/export/csv
 *
 * Note: backend path has the /csv suffix.
 */
export async function GET() {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/agents/seo/outreach/contacts/export/csv', g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
