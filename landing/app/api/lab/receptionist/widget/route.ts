import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET ?view=config|verification. POST { action:'save'|'verify', ... }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const view = new URL(req.url).searchParams.get('view') || 'config';
  const path = view === 'verification' ? `${A}/widget/verification` : `${A}/widget/config`;
  const r = await backendGet(path, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let r;
  if (action === 'save') r = await backendSend('POST', `${A}/widget/config`, g.tenant, rest);
  else if (action === 'verify') r = await backendSend('POST', `${A}/widget/verify`, g.tenant, { domain: String(rest.domain || '') });
  else return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
