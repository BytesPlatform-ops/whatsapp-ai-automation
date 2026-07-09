import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** Health + capabilities (merged) for the receptionist service. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const [health, caps] = await Promise.all([
    backendGet(`${A}/health`, g.tenant),
    backendGet(`${A}/capabilities`, g.tenant),
  ]);
  if (!health.backendUp) return degraded();
  return NextResponse.json(
    { backendUp: true, ...(health.data as object), capabilities: caps.backendUp ? caps.data : undefined },
    { status: health.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
