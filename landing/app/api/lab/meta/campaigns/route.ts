import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta campaigns → Python `/api/meta/campaigns` (marketing.view to list,
 * marketing.manage to create). Creation is always PAUSED backend-side — this
 * proxy never sends a status. Tenant resolved server-side; no tokens returned.
 */

export async function GET(req: Request) {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const ad_account_id = new URL(req.url).searchParams.get('ad_account_id') || '';
  const r = await backendForward('GET', '/api/meta/campaigns', g.tenant, undefined, { ad_account_id });
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

export async function POST(req: Request) {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendForward('POST', '/api/meta/campaigns', g.tenant, {
    ad_account_id: String(b.ad_account_id || ''),
    name: String(b.name || ''),
    objective: String(b.objective || 'OUTCOME_TRAFFIC'),
    // NOTE: no status — the backend forces PAUSED. Never send an active status.
  });
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
