import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta connection diagnostics → Python `/api/meta/diagnostics` (marketing.view).
 * Read-only health check; never returns tokens. In live mode the backend makes
 * several Graph calls (ad accounts / campaigns / insights / permissions), so we
 * allow a longer timeout than the default. Tenant is resolved server-side.
 */
export async function GET() {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const r = await backendForward('GET', '/api/meta/diagnostics', g.tenant, undefined, undefined, 30000);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
