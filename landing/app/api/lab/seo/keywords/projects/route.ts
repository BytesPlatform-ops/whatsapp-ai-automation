import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/keywords/projects  — list keyword projects (seo.view)
 *  POST /api/lab/seo/keywords/projects — create a project   (seo.manage) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const site_id = searchParams.get('site_id') ?? undefined;
  const r = await backendGet('/api/agents/seo/keywords/projects', g.tenant, site_id ? { site_id } : undefined);
  if (!r.backendUp) return degraded({ projects: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendSend('POST', '/api/agents/seo/keywords/projects', g.tenant, {
    name: b.name,
    site_id: b.site_id,
    country: b.country,
    language: b.language,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
