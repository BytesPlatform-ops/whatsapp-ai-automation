import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Outreach contacts proxy — /api/lab/seo/outreach/contacts
 *   GET  — list contacts (seo.view)
 *   POST — import / suppress (seo.manage)
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const params: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) { if (k !== 'tenant_id') params[k] = v; }
  const r = await backendGet('/api/agents/seo/outreach/contacts', g.tenant, params);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? '');
  const path = action === 'suppress'
    ? '/api/agents/seo/outreach/contacts/suppress'
    : '/api/agents/seo/outreach/contacts/import';
  const r = await backendSend('POST', path, g.tenant, b);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
