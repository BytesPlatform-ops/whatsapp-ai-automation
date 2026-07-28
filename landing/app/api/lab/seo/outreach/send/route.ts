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

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.draft_id) {
    return NextResponse.json({ backendUp: true, error: 'draft_id is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/outreach/send', g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
