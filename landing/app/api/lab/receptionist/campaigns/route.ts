import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** GET campaigns, or ?campaign_id= for its classified replies.
 *  POST { action:'ingest', campaign_id?, message, email?, phone? }. */
export async function GET(req: Request) {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const cid = new URL(req.url).searchParams.get('campaign_id');
  const path = cid ? `${A}/campaigns/${encodeURIComponent(cid)}/replies` : `${A}/campaigns`;
  const r = await backendGet(path, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const { action, ...rest } = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (action !== 'ingest') return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  if (!String(rest.message || '').trim()) return NextResponse.json({ backendUp: true, error: 'message required' }, { status: 400 });
  const r = await backendSend('POST', `${A}/campaigns/replies/ingest`, g.tenant, rest);
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
