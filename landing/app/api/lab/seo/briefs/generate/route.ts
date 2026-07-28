import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/lab/seo/briefs/generate — AI-generate a brief outline (seo.manage) */

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.brief_id) {
    return NextResponse.json({ backendUp: true, error: 'brief_id is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/briefs/generate', g.tenant, { brief_id: b.brief_id });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
