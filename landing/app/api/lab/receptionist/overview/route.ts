import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Dashboard analytics roll-up → Python /api/agents/ai-receptionist/overview. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/agents/ai-receptionist/overview', g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
