import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/google/properties?connection_id= — list available properties (seo.view) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const connection_id = searchParams.get('connection_id') ?? '';
  if (!connection_id) {
    return NextResponse.json({ backendUp: true, error: 'connection_id is required' }, { status: 400 });
  }
  const r = await backendGet('/api/agents/seo/google/properties', g.tenant, { connection_id });
  if (!r.backendUp) return degraded({ properties: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
