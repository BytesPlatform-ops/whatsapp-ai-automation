import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reviews proxy — /api/lab/seo/reviews
 *   GET  — list reviews with optional filters (seo.view)
 *   POST — draft / approve a response (seo.manage; approval required for send)
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const params: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) { if (k !== 'tenant_id') params[k] = v; }
  const r = await backendGet('/api/agents/seo/reviews', g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? '');
  const path = action === 'approve_response' ? '/api/agents/seo/reviews/approve' : '/api/agents/seo/gbp/reviews/draft';
  const r = await backendSend('POST', path, g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
