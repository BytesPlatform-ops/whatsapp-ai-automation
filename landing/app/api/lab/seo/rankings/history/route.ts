import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/rankings/history?keyword_id=&days= — rank history (seo.view) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const keyword_id = searchParams.get('keyword_id') ?? '';
  const days = searchParams.get('days') ?? undefined;
  if (!keyword_id) {
    return NextResponse.json({ backendUp: true, error: 'keyword_id is required' }, { status: 400 });
  }
  const params: Record<string, string> = { keyword_id };
  if (days) params.days = days;
  const r = await backendGet('/api/agents/seo/rank/history', g.tenant, params);
  if (!r.backendUp) return degraded({ history: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
