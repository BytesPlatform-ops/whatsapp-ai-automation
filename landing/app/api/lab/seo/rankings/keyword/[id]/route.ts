import { NextResponse } from 'next/server';
import { guard, backendGet, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

/** GET /api/lab/seo/rankings/keyword/[id] — keyword detail + history (seo.view) */

export async function GET(_req: Request, { params }: Params) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const r = await backendGet(`/api/agents/seo/rank/keyword/${encodeURIComponent(params.id)}`, g.tenant);
  if (!r.backendUp) return degraded({});
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
