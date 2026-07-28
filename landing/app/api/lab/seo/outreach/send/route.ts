import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Outreach send proxy — /api/lab/seo/outreach/send
 *   POST — send an approved draft (seo.manage; draft must have status=approved)
 *
 * The backend enforces the approval gate. The proxy does NOT verify status locally
 * so the backend's approval check is the authoritative gate.
 */

/**
 * Backend route (seo/outreach/routes.py):
 *   POST /outreach/send
 *   Body: { campaign_id, contact_id, sequence_index?, is_mock? }
 *
 * The backend is approval-gated: it checks campaign + draft status internally.
 */
export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.campaign_id || !b.contact_id) {
    return NextResponse.json({ backendUp: true, error: 'campaign_id and contact_id are required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/outreach/send', g.tenant, {
    campaign_id: b.campaign_id,
    contact_id: b.contact_id,
    sequence_index: b.sequence_index ?? 0,
    is_mock: b.is_mock ?? true,
  });
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
