import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/lab/seo/google/connections — list Google connections (seo.view) */

export async function GET() {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/agents/seo/google/connections', g.tenant);
  if (!r.backendUp) return degraded({ connections: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
