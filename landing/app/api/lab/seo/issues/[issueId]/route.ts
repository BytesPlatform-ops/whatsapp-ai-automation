import { NextResponse } from 'next/server';
import { guard, backendForward, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO issue resolve proxy — /api/lab/seo/issues/[issueId]
 *   POST — mark an issue as resolved     (seo.manage)
 */

interface Ctx { params: { issueId: string } }

export async function POST(_req: Request, { params }: Ctx) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const issueId = params.issueId;
  const r = await backendForward(
    'POST',
    `/api/agents/seo/issues/${encodeURIComponent(issueId)}/resolve`,
    g.tenant,
    {},
  );
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json(
    { backendUp: true, ...(r.data && typeof r.data === 'object' ? r.data : { data: r.data }) },
    { status: r.status },
  );
}
