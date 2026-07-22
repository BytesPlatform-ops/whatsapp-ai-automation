import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Content Calendar → Python `/api/meta/calendar*`.
 *  GET     (marketing.view)   — the current calendar
 *  POST    (marketing.view)   — generate a 7/30-day plan (replaces current)
 *  PATCH   (marketing.manage) — edit one item (status/fields)
 *  DELETE  (marketing.manage) — remove one item
 * Tenant resolved server-side; nothing publishes to Meta.
 */
export async function GET() {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const r = await backendForward('GET', '/api/meta/calendar', g.tenant);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

// Per-item actions map to their own backend endpoints; all require marketing.manage
// except 'generate' (read-only) which builds a fresh plan.
const ITEM_ACTIONS: Record<string, string> = {
  regenerate: '/api/meta/calendar/regenerate',
  'save-to-library': '/api/meta/calendar/save-to-library',
  'request-publish': '/api/meta/calendar/request-publish',
};

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || 'generate');

  if (action in ITEM_ACTIONS) {
    const g = await guard('marketing.manage');
    if (!g.ok) return g.response;
    const r = await backendForward('POST', ITEM_ACTIONS[action], g.tenant, { id: String(b.id || '') }, undefined, 45000);
    if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
    return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
  }

  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const r = await backendForward('POST', '/api/meta/calendar/generate', g.tenant,
    { horizon: Number(b.horizon) || 7, start_date: String(b.start_date || '') }, undefined, 60000);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

export async function PATCH(req: Request) {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendForward('PATCH', '/api/meta/calendar', g.tenant,
    { id: String(b.id || ''), patch: b.patch || {} });
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

export async function DELETE(req: Request) {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  const r = await backendForward('DELETE', '/api/meta/calendar', g.tenant, undefined, { id });
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
