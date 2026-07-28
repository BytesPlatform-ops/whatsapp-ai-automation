import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/lab/seo/opportunities/generate — generate new opportunities (seo.manage) */

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.site_id) {
    return NextResponse.json({ backendUp: true, error: 'site_id is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/opportunities/generate', g.tenant, {
    site_id: b.site_id,
    project_id: b.project_id,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
