import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Brand Brain → Python `/api/meta/brand-brain`.
 *  GET  (marketing.view)   — the persisted Brand Brain (or exists:false).
 *  POST (marketing.manage) — (re)analyze old posts and rebuild it. Read-only over
 *  Meta (only reads posts/media); mutates our stored brain, so it needs manage.
 * Tenant resolved server-side; token never exposed. Generation fetches posts +
 * runs a model, so it gets a longer timeout.
 */
export async function GET() {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const r = await backendForward('GET', '/api/meta/brand-brain', g.tenant, undefined, undefined, 30000);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}

export async function POST() {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  const r = await backendForward('POST', '/api/meta/brand-brain/generate', g.tenant, {}, undefined, 45000);
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
