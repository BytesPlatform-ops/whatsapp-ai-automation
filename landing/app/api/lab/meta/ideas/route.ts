import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Idea Curator → Python `/api/meta/ideas*`.
 *  GET                          (marketing.view)   — saved idea library
 *  POST {action:'generate'}     (marketing.view)   — fresh ideas (read-only)
 *  POST {action:'save', idea}   (marketing.manage) — save an idea to the library
 *  DELETE ?id=                  (marketing.manage) — remove a saved idea
 * Tenant resolved server-side; nothing publishes to Meta.
 */
export async function GET() {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const r = await backendForward('GET', '/api/meta/ideas', g.tenant);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || 'generate');
  const g = await guard(action === 'save' ? 'marketing.manage' : 'marketing.view');
  if (!g.ok) return g.response;

  const r = action === 'save'
    ? await backendForward('POST', '/api/meta/ideas/save', g.tenant, { idea: b.idea || {} })
    : await backendForward('POST', '/api/meta/ideas/generate', g.tenant,
        { types: b.types || [], per_type: b.per_type || 2 }, undefined, 45000);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

export async function DELETE(req: Request) {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  const id = new URL(req.url).searchParams.get('id') || '';
  const r = await backendForward('DELETE', '/api/meta/ideas', g.tenant, undefined, { id });
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
