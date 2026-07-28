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
  const path = b.action === 'update'
    ? '/api/agents/seo/outreach/campaigns/update'
    : '/api/agents/seo/outreach/campaigns';
  const r = await backendSend('POST', path, g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
