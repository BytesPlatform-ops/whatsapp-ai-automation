import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET  /api/lab/seo/competitors?site_id= — list competitors (seo.view)
 *  POST /api/lab/seo/competitors         — add a competitor  (seo.manage) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get('site_id') ?? undefined;
  const r = await backendGet('/api/agents/seo/competitors', g.tenant, site_id ? { site_id } : undefined);
  if (!r.backendUp) return degraded({ competitors: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.domain) {
    return NextResponse.json({ backendUp: true, error: 'domain is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/competitors', g.tenant, {
    domain: b.domain,
    site_id: b.site_id,
    project_id: b.project_id,
    display_name: b.display_name,
    notes: b.notes,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
