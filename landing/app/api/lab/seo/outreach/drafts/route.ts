import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Outreach drafts proxy — /api/lab/seo/outreach/drafts
 *   GET  — list drafts (seo.view)
 *   POST — generate or approve draft; approval required before send (seo.manage)
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const campaign_id = new URL(req.url).searchParams.get('campaign_id') ?? undefined;
  const r = await backendGet('/api/agents/seo/outreach/drafts', g.tenant, campaign_id ? { campaign_id } : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? 'generate');
  const path = action === 'approve'
    ? '/api/agents/seo/outreach/drafts/approve'
    : '/api/agents/seo/outreach/drafts/generate';
  const r = await backendSend('POST', path, g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
