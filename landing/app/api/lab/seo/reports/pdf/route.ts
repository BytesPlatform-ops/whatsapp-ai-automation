import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF report proxy — /api/lab/seo/reports/pdf
 *
 * Backend routes (seo/reporting/routes.py):
 *   POST /reports/pdf  — generate PDF; body: { site_id, kind, date_from, date_to, workspace_name? }
 *                        returns: { report_id, download_url, kind, byte_size, sha256, expires_at }
 *   GET  /reports/pdf  — list generated reports; query: ?site_id=
 *
 * POST (seo.view) — generate a PDF report
 * GET  (seo.view) — list previously generated reports
 */

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const site_id = new URL(req.url).searchParams.get('site_id');
  const r = await backendGet('/api/agents/seo/reports/pdf', g.tenant, site_id ? { site_id } : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!b.site_id) {
    return NextResponse.json({ backendUp: true, error: 'site_id is required' }, { status: 400 });
  }
  if (!b.kind) {
    return NextResponse.json({ backendUp: true, error: 'kind is required (e.g. "full", "technical", "links")' }, { status: 400 });
  }
  if (!b.date_from || !b.date_to) {
    return NextResponse.json({ backendUp: true, error: 'date_from and date_to (YYYY-MM-DD) are required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/reports/pdf', g.tenant, {
    site_id: b.site_id,
    kind: b.kind,
    date_from: b.date_from,
    date_to: b.date_to,
    workspace_name: b.workspace_name ?? '',
  });
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
