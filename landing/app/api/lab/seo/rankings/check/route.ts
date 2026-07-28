import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/lab/seo/rankings/check — trigger a rank-check job (seo.manage) */

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.project_id) {
    return NextResponse.json({ backendUp: true, error: 'project_id is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/rank/check', g.tenant, {
    project_id: b.project_id,
    keyword_ids: b.keyword_ids,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
