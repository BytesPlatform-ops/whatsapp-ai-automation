import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta ad accounts → Python `/api/meta/ad-accounts` (marketing.view) and
 * ad-account selection → `/api/meta/assets/defaults` (marketing.manage).
 * Tenant is resolved server-side; a client tenant is never forwarded. Never
 * returns tokens. Structured errors (needs_reconnect / missing_permission) are
 * forwarded so the UI can show reconnect / permission states.
 */

export async function GET() {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const r = await backendForward('GET', '/api/meta/ad-accounts', g.tenant);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

export async function POST(req: Request) {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ad_account_id = String(b.ad_account_id || '');
  const r = await backendForward('POST', '/api/meta/assets/defaults', g.tenant, { ad_account_id });
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
