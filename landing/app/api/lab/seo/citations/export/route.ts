import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const location_id = new URL(req.url).searchParams.get('location_id') ?? undefined;
  const r = await backendGet('/api/agents/seo/citations/export', g.tenant, location_id ? { location_id } : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
