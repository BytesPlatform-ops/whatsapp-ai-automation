import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Meta analytics summary → Python `/api/meta/analytics/summary` (marketing.view). */
export async function GET(req: Request) {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const range = new URL(req.url).searchParams.get('range') || 'last_30_days';
  const r = await backendGet('/api/meta/analytics/summary', g.tenant, { range });
  if (!r.backendUp) return degraded({ summary: null });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
