import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta unified inbox (comments + DMs) → Python `/api/meta/inbox` (read) and
 * `/api/agents/marketing/meta/inbox/*` (actions).
 *   GET  ?type=comment|dm                            list items          (marketing.view)
 *   POST { action:'analyze'|'prepare-reply'|'route'|'hide', item_id, reply? }
 *                                                    triage an item      (marketing.manage)
 */

export async function GET(req: Request) {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const type = new URL(req.url).searchParams.get('type') || '';
  const r = await backendGet('/api/meta/inbox', g.tenant, { type });
  if (!r.backendUp) return degraded({ inbox: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

const ACTIONS: Record<string, string> = {
  analyze: '/api/agents/marketing/meta/inbox/analyze',
  'prepare-reply': '/api/agents/marketing/meta/inbox/prepare-reply',
  route: '/api/agents/marketing/meta/inbox/route',
  hide: '/api/agents/marketing/meta/inbox/hide',
};

export async function POST(req: Request) {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const path = ACTIONS[String(b.action || '')];
  const item_id = String(b.item_id || '');
  if (!path) return NextResponse.json({ backendUp: true, error: 'unknown inbox action' }, { status: 400 });
  if (!item_id) return NextResponse.json({ backendUp: true, error: 'item_id required' }, { status: 400 });
  const r = await backendSend('POST', path, g.tenant, { item_id, reply: b.reply || '' });
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
