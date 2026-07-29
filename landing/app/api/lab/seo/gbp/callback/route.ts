import { NextResponse } from 'next/server';
import { guard, backendForward } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GBP OAuth callback proxy — /api/lab/seo/gbp/callback
 *
 * Backend route (seo/local/routes.py):
 *   POST /gbp/callback { state, code } — completes the OAuth handshake.
 *
 * Uses backendForward so the backend's structured 400 bodies
 * (`{error:'invalid_state', message}`) are surfaced to the client for a clear
 * "reconnect" UX, rather than collapsing into a generic degrade. The tenant is
 * still injected server-side; a client tenant is never trusted.
 */
export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const state = String(b.state ?? '');
  const code = String(b.code ?? '');
  if (!state || !code) {
    return NextResponse.json({ backendUp: true, error: 'state and code are required' }, { status: 400 });
  }
  const r = await backendForward('POST', `/api/agents/seo/gbp/callback`, g.tenant, { state, code });
  if (!r.backendUp) {
    return NextResponse.json({ backendUp: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
