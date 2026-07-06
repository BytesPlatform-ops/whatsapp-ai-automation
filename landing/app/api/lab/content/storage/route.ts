import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Content storage readiness → Python `/api/content/storage/status` (content.view).
 *  Drives the "storage not configured / setup required" banner. */
export async function GET() {
  const g = await guard('content.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/content/storage/status', g.tenant);
  if (!r.backendUp) return degraded({ configured: false });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
