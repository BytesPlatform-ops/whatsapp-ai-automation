import { NextResponse } from 'next/server';
import { guard, backendGet, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO Backlinks proxy — /api/lab/seo/backlinks
 *   GET  — list backlinks with optional filters (seo.view)
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const params: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) { if (k !== 'tenant_id') params[k] = v; }
  const r = await backendGet('/api/agents/seo/backlinks', g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
