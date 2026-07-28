import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/lab/seo/competitors/gap — competitor keyword gap analysis (seo.manage) */

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.site_id) {
    return NextResponse.json({ backendUp: true, error: 'site_id is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/competitors/gap', g.tenant, {
    site_id: b.site_id,
    competitor_ids: b.competitor_ids,
  });
  if (!r.backendUp) return degraded({ gap: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
