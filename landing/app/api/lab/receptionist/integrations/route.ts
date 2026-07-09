import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** GET aggregated integration status (LLM + core connectors + receptionist
 *  providers + persistence). POST { action:'test', capability } to test one. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const r = await backendGet(`${A}/integrations/status`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const capability = String(b.capability || '').trim();
  if (!capability) return NextResponse.json({ backendUp: true, error: 'capability required' }, { status: 400 });
  const r = await backendSend('POST', `${A}/integrations/test`, g.tenant, { capability });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
