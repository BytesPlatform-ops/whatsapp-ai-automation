import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GBP accounts + locations listing proxy —
 *   /api/lab/seo/gbp/connections/{id}/accounts
 *
 * Backend routes (seo/local/routes.py):
 *   GET /gbp/connections/{connection_id}/accounts
 *   GET /gbp/connections/{connection_id}/accounts/{account_name:path}/locations
 *
 * Without ?account= it lists the connection's GBP accounts. With
 * ?account=<account_name> it lists that account's locations (the account_name
 * is server-provided from the accounts response, so it is forwarded raw into
 * the backend's `:path` segment after stripping any leading slash / traversal).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ backendUp: true, error: 'connection id is required' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const account = searchParams.get('account');

  let path: string;
  if (account) {
    // account_name is an opaque GBP resource path (e.g. "accounts/123"); keep
    // its internal slashes for the backend `:path` param but block traversal.
    const safeAccount = account.replace(/^\/+/, '').replace(/\.\.(\/|$)/g, '');
    path = `/api/agents/seo/gbp/connections/${encodeURIComponent(id)}/accounts/${safeAccount}/locations`;
  } else {
    path = `/api/agents/seo/gbp/connections/${encodeURIComponent(id)}/accounts`;
  }
  const r = await backendGet(path, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}
