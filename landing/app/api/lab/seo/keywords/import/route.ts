import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Keywords CSV import proxy — /api/lab/seo/keywords/import
 *
 * Backend route (seo/keywords/project_routes.py):
 *   POST /keywords/projects/{project_id}/keywords/import
 *   Body: { csv_text, tags?, auto_add? }
 *
 * Note: backend field name is `csv_text` (not `csv_content`).
 */
export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const project_id = String(b.project_id ?? '');
  // Accept csv_content (client) or csv_text (already correct name)
  const csv_text = String(b.csv_text ?? b.csv_content ?? '');
  if (!project_id || !csv_text) {
    return NextResponse.json({ backendUp: true, error: 'project_id and csv_text (or csv_content) are required' }, { status: 400 });
  }
  const r = await backendSend('POST', `/api/agents/seo/keywords/projects/${encodeURIComponent(project_id)}/keywords/import`, g.tenant, {
    csv_text,
    tags: b.tags ?? [],
    auto_add: b.auto_add ?? false,
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
