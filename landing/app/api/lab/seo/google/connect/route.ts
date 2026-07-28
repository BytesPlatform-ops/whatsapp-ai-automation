import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/lab/seo/google/connect — initiate Google OAuth flow (seo.manage) */

export async function POST() {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const r = await backendSend('POST', '/api/agents/seo/google/connect', g.tenant, {});
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
