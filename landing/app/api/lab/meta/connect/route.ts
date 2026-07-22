import { NextResponse } from 'next/server';
import { guard, backendSend, BACKEND, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta OAuth connect flow → Python `/api/meta/connect/*` (marketing.manage).
 *   GET  ?feature=comments|dms|...   307-redirect into the backend OAuth start
 *                                    (tenant injected server-side; opened in a popup)
 *   POST { action:'demo' }           seed demo data
 *   POST { action:'disconnect' }     clear the connection
 */

export async function GET(req: Request) {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  // NOTE: 'publishing' / 'comments' / 'dms' intentionally NOT allowed for now —
  // those features add pages_manage_*/instagram_* scopes we don't have App Review
  // for yet. The backend also ignores `feature` entirely when META_SCOPES is set.
  const ALLOWED_FEATURES = new Set(['insights', 'ads_read', 'ads']);
  const raw = new URL(req.url).searchParams.get('feature') || '';
  const feature = ALLOWED_FEATURES.has(raw) ? raw : '';
  const url = new URL('/api/meta/connect/start', BACKEND);
  url.searchParams.set('tenant_id', g.tenant);
  if (feature) url.searchParams.set('feature', feature);
  // TEMP DEBUG — final redirect URL (tenant + feature only; no secret/token). Remove later.
  console.log('[lab/meta/connect] redirect →', url.toString());
  return NextResponse.redirect(url.toString(), { status: 307 });
}

export async function POST(req: Request) {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const path = b.action === 'disconnect' ? '/api/meta/disconnect' : '/api/meta/connect/demo';
  const r = await backendSend('POST', path, g.tenant, {});
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
