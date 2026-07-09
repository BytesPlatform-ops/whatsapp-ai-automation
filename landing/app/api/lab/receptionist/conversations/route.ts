import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** GET list, or ?id= for a conversation thread (messages + actions).
 *  POST { action:'escalate', id, reason }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const id = new URL(req.url).searchParams.get('id');
  const path = id ? `${A}/conversations/${encodeURIComponent(id)}` : `${A}/conversations`;
  const r = await backendGet(path, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  if (b.action !== 'escalate' || !id) return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  const r = await backendSend('POST', `${A}/conversations/${encodeURIComponent(id)}/escalate`, g.tenant, { reason: b.reason || '' });
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
