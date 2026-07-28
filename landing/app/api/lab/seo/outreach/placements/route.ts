import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const campaign_id = new URL(req.url).searchParams.get('campaign_id') ?? undefined;
  const r = await backendGet('/api/agents/seo/outreach/placements', g.tenant, campaign_id ? { campaign_id } : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
