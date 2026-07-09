import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** GET the business profile. POST a patch → PATCH backend business-profile. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const r = await backendGet(`${A}/business-profile`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const patch = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendSend('PATCH', `${A}/business-profile`, g.tenant, patch);
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
