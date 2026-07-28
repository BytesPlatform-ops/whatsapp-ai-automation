import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/lab/seo/briefs/generate — AI-generate a brief (seo.manage)
 *
 * Backend route (seo/intelligence/routes.py):
 *   POST /briefs/generate
 *   Body: GenerateBriefBody — requires primary_keyword, project_id, site_id
 *
 * Note: there is no "brief_id re-generate" pattern in the backend. Generating
 * a brief always creates a new Brief row from keyword inputs. Pass the full
 * keyword context in the request body.
 */
export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const primary_keyword = String(b.primary_keyword ?? b.keyword ?? '');
  if (!primary_keyword) {
    return NextResponse.json({ backendUp: true, error: 'primary_keyword is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/briefs/generate', g.tenant, {
    primary_keyword,
    site_id: b.site_id ?? '',
    project_id: b.project_id ?? '',
    secondary_keywords: b.secondary_keywords ?? [],
    cluster_id: b.cluster_id ?? '',
    search_intent: b.search_intent ?? '',
    target_audience: b.target_audience ?? '',
    word_count_min: b.word_count_min ?? 800,
    word_count_max: b.word_count_max ?? 2000,
    cta_direction: b.cta_direction ?? '',
  });
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
