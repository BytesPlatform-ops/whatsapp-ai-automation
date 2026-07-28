import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Location CRUD — /api/lab/seo/locations/[id]
 *   PATCH  — update a location (seo.manage)
 *   DELETE — archive a location (seo.manage)
 */

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendSend('PATCH', `/api/agents/seo/locations/${encodeURIComponent(id)}`, g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const { id } = await params;
  const r = await backendSend('DELETE', `/api/agents/seo/locations/${encodeURIComponent(id)}`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
