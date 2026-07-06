import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO platform connections → Python `/api/agents/seo/connections/*`.
 *   GET                                         connection status matrix (seo.view)
 *   POST { kind:'wordpress', site_url, username, application_password }
 *   POST { kind:'token', platform, token, site_id? }
 *   POST { kind:'disconnect', platform }        (all mutations: seo.manage)
 * Credentials pass straight through to the backend store; they are never
 * returned by the status endpoint.
 */

export async function GET() {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const r = await backendGet('/api/agents/seo/connections/status', g.tenant);
  if (!r.backendUp) return degraded({ platforms: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(b.kind || '');

  let path = '';
  let body: Record<string, unknown> = {};
  if (kind === 'wordpress') {
    path = '/api/agents/seo/connections/wordpress/connect';
    body = { site_url: b.site_url, username: b.username, application_password: b.application_password };
  } else if (kind === 'token') {
    path = '/api/agents/seo/connections/token/connect';
    body = { platform: b.platform, token: b.token || '', site_id: b.site_id || '' };
  } else if (kind === 'disconnect') {
    path = '/api/agents/seo/connections/disconnect';
    body = { platform: b.platform };
  } else {
    return NextResponse.json({ backendUp: true, error: 'unknown connection kind' }, { status: 400 });
  }

  const r = await backendSend('POST', path, g.tenant, body);
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
