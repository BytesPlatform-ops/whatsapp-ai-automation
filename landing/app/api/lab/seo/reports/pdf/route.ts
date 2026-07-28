import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF report export proxy — /api/lab/seo/reports/pdf
 *   POST — generate a tokenized PDF download URL (seo.view)
 *   Body: { site_id?, crawl_job_id?, audience?: 'client' | 'internal' }
 *   Returns: { report_id: string; download_url: string }
 */

export async function POST(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await backendSend('POST', '/api/agents/seo/reports/pdf', g.tenant, {
    site_id: b.site_id,
    crawl_job_id: b.crawl_job_id,
    audience: b.audience ?? 'client',
  });
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...(r.data as object ?? {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
