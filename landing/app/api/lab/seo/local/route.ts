import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Local SEO overview proxy — /api/lab/seo/local
 *   GET  — returns SeoLocalOverview (seo.view)
 */

export async function GET() {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/agents/seo/local', g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
