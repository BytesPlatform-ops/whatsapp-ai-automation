import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/alerts?site_id= — list alerts (seo.view) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get('site_id') ?? undefined;
  const r = await backendGet('/api/agents/seo/alerts', g.tenant, site_id ? { site_id } : undefined);
  if (!r.backendUp) return degraded({ alerts: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
