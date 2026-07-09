import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** GET payment requests. POST { action:'create-link', amount, currency?, description?, email? }. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const r = await backendGet(`${A}/payments`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (action !== 'create-link') return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!(Number(rest.amount) > 0)) return NextResponse.json({ backendUp: true, error: 'A positive amount is required' }, { status: 400 });
  const r = await backendSend('POST', `${A}/payments/create-link`, g.tenant, rest);
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
