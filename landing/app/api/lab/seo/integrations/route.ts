import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/integrations — detailed integration status for the Connections page (seo.view) */

export async function GET() {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/agents/seo/integrations', g.tenant);
  if (!r.backendUp) return degraded({ integrations: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
