import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ads Assistant → Python `/api/meta/ads/analyze` (marketing.view — read-only:
 * it never creates or changes a campaign). Returns deterministic signals plus
 * optional AI suggestions. Tenant is resolved server-side; token never exposed.
 */
export async function POST(req: Request) {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendForward(
    'POST',
    '/api/meta/ads/analyze',
    g.tenant,
    { ad_account_id: String(b.ad_account_id || ''), range: String(b.range || 'last_30d') },
    undefined,
    30000,
  );
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
