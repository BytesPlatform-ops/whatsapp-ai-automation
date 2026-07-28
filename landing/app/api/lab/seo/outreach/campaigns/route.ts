import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Outreach campaigns proxy — /api/lab/seo/outreach/campaigns
 *   GET  — list campaigns (seo.view)
 *   POST — create or update campaign (seo.manage)
 */

export async function GET() {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/agents/seo/outreach/campaigns', g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Backend: PATCH /outreach/campaigns/{id} for updates (no /campaigns/update endpoint)
  if (b.action === 'update') {
    const campaign_id = String(b.id ?? '');
    if (!campaign_id) {
      return NextResponse.json({ backendUp: true, error: 'id is required for update' }, { status: 400 });
    }
    const r = await backendSend('PATCH', `/api/agents/seo/outreach/campaigns/${encodeURIComponent(campaign_id)}`, g.tenant, b);
    if (!r.backendUp) return degraded();
    return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
  }
  // Create: POST /outreach/campaigns
  const r = await backendSend('POST', '/api/agents/seo/outreach/campaigns', g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
