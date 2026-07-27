import { NextResponse } from 'next/server';
import { guard, backendGet, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO single-site proxy — /api/lab/seo/sites/[siteId]
 *   GET    — get a site by ID              (seo.view)
 *   PATCH  — edit crawl settings           (seo.manage)
 *   DELETE — delete / archive a site       (seo.manage)
 */

interface Ctx { params: { siteId: string } }

export async function GET(_req: Request, { params }: Ctx) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const siteId = params.siteId;
  const r = await backendGet(`/api/agents/seo/sites/${encodeURIComponent(siteId)}`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json(
    { backendUp: true, ...(r.data as object) },
    { status: r.status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const siteId = params.siteId;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendForward('PATCH', `/api/agents/seo/sites/${encodeURIComponent(siteId)}`, g.tenant, b);
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json(
    { backendUp: true, ...(r.data && typeof r.data === 'object' ? r.data : { data: r.data }) },
    { status: r.status },
  );
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const siteId = params.siteId;
  const r = await backendForward('DELETE', `/api/agents/seo/sites/${encodeURIComponent(siteId)}`, g.tenant);
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json(
    { backendUp: true, ...(r.data && typeof r.data === 'object' ? r.data : { data: r.data }) },
    { status: r.status },
  );
}
