import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET widget config. POST { action:'save', ... } to update config/domains. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const r = await backendGet(`${A}/widget/config`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (action !== 'save') return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  const r = await backendSend('POST', `${A}/widget/config`, g.tenant, rest);
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
