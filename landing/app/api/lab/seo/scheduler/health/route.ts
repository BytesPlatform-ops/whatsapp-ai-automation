import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduler health proxy — /api/lab/seo/scheduler/health
 * Internal admin view only — requires seo.manage.
 */

export async function GET() {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/agents/seo/scheduler/health', g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
