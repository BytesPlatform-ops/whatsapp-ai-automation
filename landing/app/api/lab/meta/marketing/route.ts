import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Marketing Brain → Python `/api/meta/marketing/*`.
 *  GET ?resource=recommendations|state|brain  (marketing.view)
 *  POST {action:'analyze'}                      (marketing.view)   — local-first, fast
 *  POST {action:'resolve', id, decision}        (marketing.manage) — approve/skip a rec
 * Analysis is local-first on the backend, so a longer timeout is precautionary
 * (it never waits on an external model). Tenant resolved server-side; no token exposed.
 */
const RESOURCE_PATH: Record<string, string> = {
  recommendations: '/api/meta/marketing/recommendations',
  state: '/api/meta/marketing/state',
  brain: '/api/meta/marketing/brain',
  profile: '/api/meta/marketing/profile',
};

export async function GET(req: Request) {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const resource = new URL(req.url).searchParams.get('resource') || 'recommendations';
  const path = RESOURCE_PATH[resource] || RESOURCE_PATH.recommendations;
  const r = await backendForward('GET', path, g.tenant);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || 'analyze');

  if (action === 'resolve') {
    const g = await guard('marketing.manage');
    if (!g.ok) return g.response;
    const id = String(b.id || '');
    const decision = b.decision === 'approve' ? 'approve' : 'skip';
    const r = await backendForward('POST', `/api/meta/marketing/recommendations/${encodeURIComponent(id)}/${decision}`, g.tenant, {});
    if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
    return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
  }

  if (action === 'save-profile') {
    const g = await guard('marketing.manage');
    if (!g.ok) return g.response;
    const r = await backendForward('POST', '/api/meta/marketing/profile', g.tenant, { answers: b.answers || {} });
    if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
    return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
  }

  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const r = await backendForward('POST', '/api/meta/marketing/analyze', g.tenant, {}, undefined, 40000);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
