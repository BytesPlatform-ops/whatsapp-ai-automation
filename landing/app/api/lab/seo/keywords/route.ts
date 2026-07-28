import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET  /api/lab/seo/keywords?project_id= — list keywords (seo.view)
 *  POST /api/lab/seo/keywords            — add a keyword   (seo.manage) */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const params: Record<string, string> = {};
  const project_id = searchParams.get('project_id');
  const limit = searchParams.get('limit');
  const offset = searchParams.get('offset');
  if (project_id) params.project_id = project_id;
  if (limit) params.limit = limit;
  if (offset) params.offset = offset;
  const r = await backendGet('/api/agents/seo/keywords', g.tenant, params);
  if (!r.backendUp) return degraded({ keywords: [] });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendSend('POST', '/api/agents/seo/keywords', g.tenant, b);
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
