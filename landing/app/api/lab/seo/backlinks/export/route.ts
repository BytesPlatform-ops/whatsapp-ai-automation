import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const site_id = new URL(req.url).searchParams.get('site_id') ?? undefined;
  const r = await backendGet('/api/agents/seo/backlinks/export', g.tenant, site_id ? { site_id } : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
