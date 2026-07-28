import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/lab/seo/google/properties/select — select a GSC/GA4 property (seo.manage) */

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.connection_id || !b.property_id) {
    return NextResponse.json({ backendUp: true, error: 'connection_id and property_id are required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/google/properties/select', g.tenant, {
    connection_id: b.connection_id,
    property_id: b.property_id,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
