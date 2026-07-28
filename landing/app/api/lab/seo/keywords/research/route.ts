import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/lab/seo/keywords/research — keyword research (seo.manage) */

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendSend('POST', '/api/agents/seo/keywords/research', g.tenant, {
    seed: b.seed,
    country: b.country,
    language: b.language,
    project_id: b.project_id,
  });
  if (!r.backendUp) return degraded({ keywords: [], error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
