import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Competitors keyword gap proxy — /api/lab/seo/competitors/gap
 *
 * Backend route (seo/intelligence/routes.py):
 *   GET /competitors/gap?project_id=&competitor_domain=&min_volume=
 *
 * The backend takes project_id + competitor_domain (single domain), NOT site_id + competitor_ids.
 * Both GET (from client query params) and POST (from client body) are accepted here.
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const project_id = searchParams.get('project_id') ?? '';
  const competitor_domain = searchParams.get('competitor_domain') ?? '';
  if (!project_id || !competitor_domain) {
    return NextResponse.json({ backendUp: true, error: 'project_id and competitor_domain are required' }, { status: 400 });
  }
  const params: Record<string, string | number | boolean | undefined> = { project_id, competitor_domain };
  const min_volume = searchParams.get('min_volume');
  if (min_volume) params.min_volume = Number(min_volume);
  const r = await backendGet('/api/agents/seo/competitors/gap', g.tenant, params);
  if (!r.backendUp) return degraded({ gap: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const project_id = String(b.project_id ?? '');
  const competitor_domain = String(b.competitor_domain ?? '');
  if (!project_id || !competitor_domain) {
    return NextResponse.json({ backendUp: true, error: 'project_id and competitor_domain are required' }, { status: 400 });
  }
  const params: Record<string, string | number | boolean | undefined> = { project_id, competitor_domain };
  if (b.min_volume != null) params.min_volume = Number(b.min_volume);
  const r = await backendGet('/api/agents/seo/competitors/gap', g.tenant, params);
  if (!r.backendUp) return degraded({ gap: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
