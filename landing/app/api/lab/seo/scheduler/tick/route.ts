import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const r = await backendSend('POST', '/api/agents/seo/scheduler/tick', g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
