import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta ads insights → Python `/api/meta/insights` (marketing.view). Returns
 * account-level spend / impressions / clicks / ctr / cpc for the date range
 * (default last_30d). Tenant resolved server-side; no tokens returned. Structured
 * errors (needs_reconnect / missing_permission / empty) are forwarded.
 */

export async function GET(req: Request) {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const sp = new URL(req.url).searchParams;
  const ad_account_id = sp.get('ad_account_id') || '';
  const range = sp.get('range') || 'last_30d';
  const r = await backendForward('GET', '/api/meta/insights', g.tenant, undefined, { ad_account_id, range });
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
