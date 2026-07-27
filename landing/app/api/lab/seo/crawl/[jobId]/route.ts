import { NextResponse } from 'next/server';
import { guard, backendGet, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO single-job proxy — /api/lab/seo/crawl/[jobId]
 *   GET                 — job status + progress       (seo.view)
 *   POST ?action=cancel — cancel the job              (seo.manage)
 *   POST ?action=retry  — retry a failed/cancelled job (seo.manage)
 */

interface Ctx { params: { jobId: string } }

export async function GET(_req: Request, { params }: Ctx) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const jobId = params.jobId;
  const r = await backendGet(`/api/agents/seo/crawl/${encodeURIComponent(jobId)}`, g.tenant);
  if (!r.backendUp) return degraded();
  return NextResponse.json(
    { backendUp: true, ...(r.data as object) },
    { status: r.status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request, { params }: Ctx) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const jobId = params.jobId;
  const qs = new URL(req.url).searchParams;
  const action = qs.get('action') || (await req.json().catch(() => ({}))).action;

  if (action === 'cancel') {
    const r = await backendForward(
      'POST',
      `/api/agents/seo/crawl/${encodeURIComponent(jobId)}/cancel`,
      g.tenant,
      {},
    );
    if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
    return NextResponse.json(
      { backendUp: true, ...(r.data && typeof r.data === 'object' ? r.data : { data: r.data }) },
      { status: r.status },
    );
  }

  if (action === 'retry') {
    const r = await backendForward(
      'POST',
      `/api/agents/seo/crawl/${encodeURIComponent(jobId)}/retry`,
      g.tenant,
      {},
    );
    if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
    return NextResponse.json(
      { backendUp: true, ...(r.data && typeof r.data === 'object' ? r.data : { data: r.data }) },
      { status: r.status },
    );
  }

  return NextResponse.json(
    { backendUp: true, error: 'Unknown action. Use ?action=cancel or ?action=retry' },
    { status: 400 },
  );
}
