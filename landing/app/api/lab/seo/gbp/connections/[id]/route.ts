import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GBP connection lifecycle proxy — /api/lab/seo/gbp/connections/{id}
 *
 * Backend routes (seo/local/routes.py):
 *   POST   /gbp/connections/{connection_id}/refresh   — refresh access token
 *   DELETE /gbp/connections/{connection_id}           — disconnect + purge tokens
 *
 * POST is used for the refresh action (dispatched via ?action=refresh, the
 * default) so we don't need a separate nested route file.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ backendUp: true, error: 'connection id is required' }, { status: 400 });
  const r = await backendSend('POST', `/api/agents/seo/gbp/connections/${encodeURIComponent(id)}/refresh`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const { id } = await params;
  if (!id) return NextResponse.json({ backendUp: true, error: 'connection id is required' }, { status: 400 });
  const r = await backendSend('DELETE', `/api/agents/seo/gbp/connections/${encodeURIComponent(id)}`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
