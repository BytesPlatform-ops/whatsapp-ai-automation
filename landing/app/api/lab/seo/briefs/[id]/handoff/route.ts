import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export async function POST(_req: Request, { params }: Params) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const r = await backendSend('POST', `/api/agents/seo/briefs/${encodeURIComponent(params.id)}/handoff`, g.tenant, {});
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
