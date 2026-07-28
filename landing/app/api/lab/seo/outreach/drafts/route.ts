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
  // Backend routes (seo/outreach/routes.py):
  //   POST /outreach/drafts/generate            — generate a draft
  //   POST /outreach/drafts/{draft_id}/approve  — approve (not /drafts/approve)
  if (action === 'approve') {
    const draft_id = String(b.draft_id ?? '');
    if (!draft_id) {
      return NextResponse.json({ backendUp: true, error: 'draft_id is required for approve' }, { status: 400 });
    }
    const r = await backendSend('POST', `/api/agents/seo/outreach/drafts/${encodeURIComponent(draft_id)}/approve`, g.tenant, b);
    if (!r.backendUp) return degraded();
    return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  // generate
  const r = await backendSend('POST', '/api/agents/seo/outreach/drafts/generate', g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
