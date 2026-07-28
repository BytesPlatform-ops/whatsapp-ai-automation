import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/lab/seo/keywords/import — bulk import keywords from CSV (seo.manage) */

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.project_id || !b.csv_content) {
    return NextResponse.json({ backendUp: true, error: 'project_id and csv_content are required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/keywords/import', g.tenant, {
    project_id: b.project_id,
    csv_content: b.csv_content,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
